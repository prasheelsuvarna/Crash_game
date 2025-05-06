const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const WebSocket = require('ws');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');
const Player = require('../models/Player');
const GameRound = require('../models/GameRound');
const Transaction = require('../models/Transaction');

// Load environment variables from .env file
dotenv.config();

// Initialize Express app
const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

// Add CORS middleware to allow requests from the frontend
app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

// Log MongoDB URI for debugging (remove after testing)
console.log('MongoDB URI:', process.env.MONGODB_URI);

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Cache for crypto prices (price in USD, updated every 10 seconds)
const priceCache = {
  BTC: { price: 0, lastUpdated: 0 },
  ETH: { price: 0, lastUpdated: 0 },
};
const CACHE_DURATION = 10 * 1000; // 10 seconds in milliseconds

// Fetch real-time crypto price from CoinGecko
const fetchCryptoPrice = async (currency) => {
  const now = Date.now();
  const cached = priceCache[currency];

  // Return cached price if it's still valid
  if (cached.price > 0 && now - cached.lastUpdated < CACHE_DURATION) {
    return cached.price;
  }

  try {
    const coinId = currency === 'BTC' ? 'bitcoin' : 'ethereum';
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`
    );
    const price = response.data[coinId].usd;
    priceCache[currency] = { price, lastUpdated: now };
    return price;
  } catch (err) {
    console.error(`Error fetching ${currency} price:`, err.message);
    return cached.price || 0; // Fallback to last known price
  }
};

// Convert USD to crypto using price at the time of the transaction
const convertUsdToCrypto = async (usdAmount, currency) => {
  const price = await fetchCryptoPrice(currency);
  if (price === 0) return 0;
  return parseFloat((usdAmount / price).toFixed(8));
};

// Convert crypto to USD using the latest price
const convertCryptoToUsd = async (cryptoAmount, currency) => {
  const price = await fetchCryptoPrice(currency);
  if (price === 0) return 0;
  return parseFloat((cryptoAmount * price).toFixed(2));
};

// Generate a mock transaction hash
const generateTransactionHash = () => {
  return crypto.randomBytes(32).toString('hex'); // 64-character hash
};

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Welcome to Crypto Crash API' });
});

// Health-check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Endpoint to create a player
app.post('/player', async (req, res) => {
  try {
    const { playerId, username } = req.body;
    if (!playerId || !username) {
      return res.status(400).json({ error: 'playerId and username are required' });
    }
    const player = new Player({ playerId, username });
    await player.save();
    res.status(201).json({ message: 'Player created', player });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create player', details: err.message });
  }
});

// Endpoint to check player's wallet balance
app.get('/balance/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;

    const player = await Player.findOne({ playerId });
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // Get USD equivalents for BTC and ETH balances
    const btcUsd = await convertCryptoToUsd(player.wallet.BTC || 0, 'BTC');
    const ethUsd = await convertCryptoToUsd(player.wallet.ETH || 0, 'ETH');

    res.status(200).json({
      wallet: {
        BTC: {
          crypto: player.wallet.BTC || 0,
          usd: btcUsd,
        },
        ETH: {
          crypto: player.wallet.ETH || 0,
          usd: ethUsd,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch balance', details: err.message });
  }
});

// Endpoint to deposit funds into player's wallet
app.post('/deposit', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { playerId, cryptoAmount, currency } = req.body;

    // Validate input
    if (!playerId || !cryptoAmount || !currency) {
      throw new Error('playerId, cryptoAmount, and currency are required');
    }
    if (cryptoAmount <= 0) {
      throw new Error('cryptoAmount must be greater than 0');
    }
    if (!['BTC', 'ETH'].includes(currency)) {
      throw new Error('currency must be BTC or ETH');
    }

    // Check if the player exists
    const player = await Player.findOne({ playerId }).session(session);
    if (!player) {
      throw new Error('Player not found');
    }

    // Fetch price at the time of deposit
    const priceAtTime = await fetchCryptoPrice(currency);
    if (priceAtTime === 0) {
      throw new Error('Failed to fetch crypto price');
    }

    // Calculate USD equivalent of the deposit
    const usdAmount = await convertCryptoToUsd(cryptoAmount, currency);

    // Update player's wallet
    player.wallet[currency] = parseFloat(((player.wallet[currency] || 0) + cryptoAmount).toFixed(8));

    // Log the deposit transaction
    const transaction = new Transaction({
      playerId,
      usdAmount,
      cryptoAmount,
      currency,
      transactionType: 'deposit',
      transactionHash: generateTransactionHash(),
      priceAtTime,
    });

    // Save the updated player and transaction
    await player.save({ session });
    await transaction.save({ session });

    // Commit the transaction
    await session.commitTransaction();

    res.status(200).json({
      message: 'Deposit successful',
      deposit: { cryptoAmount, currency, usdAmount },
      updatedWallet: player.wallet,
    });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ error: 'Failed to deposit funds', details: err.message });
  } finally {
    session.endSession();
  }
});

// Game Logic: Track the current round, multiplier, and pending bets
let currentRound = null;
let currentMultiplier = 1.0;
let multiplierInterval = null;
let pendingBets = []; // Queue for bets placed during an active round
const FIXED_ROUND_DURATION = 10 * 1000; // 10 seconds in milliseconds

// Calculate a simple crash point (random between 1.1 and 10)
const calculateCrashPoint = () => {
  const min = 1.1;
  const max = 10.0;
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
};

// Calculate a random crash time (between 1 and 9 seconds, to ensure it crashes before the 10-second round duration)
const calculateCrashTime = () => {
  const min = 1;
  const max = 9;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Simulate multiplier growth (from 1x to crash point over the crash time)
const simulateMultiplierGrowth = (crashPoint, crashTime, roundStartTime) => {
  const crashDuration = crashTime * 1000;
  const interval = 500;
  const steps = crashDuration / interval;
  const increment = (crashPoint - 1.0) / steps;

  currentMultiplier = 1.0;

  if (multiplierInterval) {
    clearInterval(multiplierInterval);
  }

  multiplierInterval = setInterval(() => {
    const elapsedTime = Date.now() - roundStartTime;
    if (elapsedTime >= crashDuration) {
      currentMultiplier = crashPoint;
      console.log(`Multiplier reached crash point: ${currentMultiplier}x`);

      // Log players who didn't cash out
      const playersWhoDidntCashOut = currentRound.bets
        .filter((bet) => !currentRound.cashouts.some((c) => c.playerId === bet.playerId))
        .map((bet) => bet.playerId);
      console.log(`Players who didn't cash out in round ${currentRound.roundId}:`, playersWhoDidntCashOut);

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ multiplier: currentMultiplier, crashed: true }));
        }
      });
      clearInterval(multiplierInterval);
      multiplierInterval = null;

      // Calculate remaining time until the full 10 seconds
      const remainingTime = FIXED_ROUND_DURATION - elapsedTime;
      let countdown = Math.ceil(remainingTime / 1000); // Round up to the nearest second

      // Start countdown and broadcast to clients
      const countdownInterval = setInterval(() => {
        if (countdown > 0) {
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                message: `Game crashed, wait for ${countdown} seconds till next round starts`,
                countdown,
              }));
            }
          });
          countdown -= 1;
        } else {
          clearInterval(countdownInterval);
        }
      }, 1000);
    } else {
      currentMultiplier += increment;
      currentMultiplier = parseFloat(currentMultiplier.toFixed(2));
      console.log(`Multiplier: ${currentMultiplier}x`);
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ multiplier: currentMultiplier }));
        }
      });
    }
  }, interval);
};

// Start a new game round and schedule its crash
const startNewRound = async () => {
  try {
    if (currentRound) {
      currentRound.status = 'crashed';
      await currentRound.save();
      console.log(`Round ${currentRound.roundId} crashed at ${currentRound.crashPoint}x`);
    }

    const roundId = `round_${Date.now()}`;
    const startTime = Date.now(); // Use timestamp for precise timing
    const crashPoint = calculateCrashPoint();
    const crashTime = calculateCrashTime();

    // Create new round with pending bets
    const newRound = new GameRound({
      roundId,
      startTime: new Date(startTime),
      crashPoint,
      status: 'active',
      bets: pendingBets,
      cashouts: [],
    });

    // Log "entered" for each player whose bet is now applied
    pendingBets.forEach((bet) => {
      console.log(`Player ${bet.playerId} entered round ${roundId}`);
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ message: `Player ${bet.playerId} entered`, roundId }));
        }
      });
    });

    // Clear pending bets after applying them
    pendingBets = [];

    await newRound.save();
    console.log(`New round started: ${roundId} at ${new Date(startTime)}, will crash in ${crashTime} seconds at ${crashPoint}x`);

    currentRound = newRound;

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ newRound: true, roundId }));
      }
    });

    simulateMultiplierGrowth(crashPoint, crashTime, startTime);

    // Schedule the next round after the full 10 seconds
    setTimeout(startNewRound, FIXED_ROUND_DURATION);
  } catch (err) {
    console.error('Error starting new round:', err.message);
  }
};

// Start the first round immediately
startNewRound();

// Endpoint to place a bet
app.post('/bet', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { playerId, usdAmount, currency } = req.body;

    // Validate input
    if (!playerId || !usdAmount || !currency) {
      throw new Error('playerId, usdAmount, and currency are required');
    }
    if (usdAmount <= 0) {
      throw new Error('usdAmount must be greater than 0');
    }
    if (!['BTC', 'ETH'].includes(currency)) {
      throw new Error('currency must be BTC or ETH');
    }

    // Check if the player exists
    const player = await Player.findOne({ playerId }).session(session);
    if (!player) {
      throw new Error(`Player with ID ${playerId} not found`);
    }

    // Fetch price at the time of the bet
    const priceAtTime = await fetchCryptoPrice(currency);
    if (priceAtTime === 0) {
      throw new Error('Failed to fetch crypto price');
    }

    // Convert USD to crypto
    const cryptoAmount = await convertUsdToCrypto(usdAmount, currency);
    if (cryptoAmount === 0) {
      throw new Error('Invalid currency or price data');
    }

    // Check if player has sufficient balance
    const currentBalance = player.wallet[currency] || 0;
    if (currentBalance < cryptoAmount) {
      throw new Error(`Insufficient balance. Current balance: ${currentBalance}, Bet amount: ${cryptoAmount}`);
    }

    // Deduct crypto amount from wallet immediately
    player.wallet[currency] = parseFloat((currentBalance - cryptoAmount).toFixed(8));
    await player.save({ session });

    // Create the bet object
    const bet = {
      playerId,
      usdAmount,
      cryptoAmount,
      currency,
    };

    // Log the transaction immediately
    const transaction = new Transaction({
      playerId,
      usdAmount,
      cryptoAmount,
      currency,
      transactionType: 'bet',
      transactionHash: generateTransactionHash(),
      priceAtTime,
    });
    await transaction.save({ session });

    // Check if there's an active round
    let betStatus = 'placed';
    let roundId = null;

    if (currentRound && currentRound.status === 'active') {
      // If a round is active, queue the bet for the next round
      pendingBets.push(bet);
      betStatus = 'queued';
      console.log(`Player ${playerId} bet queued, waiting to enter next round`);
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ message: `Player ${playerId} waiting to enter`, bet }));
        }
      });
    } else {
      // If no active round, the bet will be applied in the next round (startNewRound will handle it)
      pendingBets.push(bet);
      betStatus = 'queued';
      console.log(`Player ${playerId} bet queued, waiting to enter next round`);
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ message: `Player ${playerId} waiting to enter`, bet }));
        }
      });
    }

    // Commit the transaction
    await session.commitTransaction();

    res.status(201).json({ message: 'Bet placed', bet, status: betStatus, roundId });
  } catch (err) {
    await session.abortTransaction();
    console.error('Error in /bet endpoint:', err.message); // Enhanced logging
    res.status(500).json({ error: 'Failed to place bet', details: err.message });
  } finally {
    session.endSession();
  }
});

// Endpoint to cash out a bet
app.post('/cashout', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { playerId } = req.body;

    // Validate input
    if (!playerId) {
      throw new Error('playerId is required');
    }

    // Check if the player exists
    const player = await Player.findOne({ playerId }).session(session);
    if (!player) {
      throw new Error('Player not found');
    }

    // Check if there's an active round
    if (!currentRound || currentRound.status !== 'active') {
      throw new Error('No active round to cash out');
    }

    // Check if the player has a pending bet
    const hasPendingBet = pendingBets.some((bet) => bet.playerId === playerId);
    if (hasPendingBet) {
      throw new Error('Bet is still pending, cannot cash out yet');
    }

    // Find the player's bet in the current round
    const bet = currentRound.bets.find((b) => b.playerId === playerId);
    if (!bet) {
      throw new Error('No bet found for this player in the current round');
    }

    // Check if the player has already cashed out
    const hasCashedOut = currentRound.cashouts.some((c) => c.playerId === playerId);
    if (hasCashedOut) {
      throw new Error('Player has already cashed out in this round');
    }

    // Fetch price at the time of cashout
    const priceAtTime = await fetchCryptoPrice(bet.currency);
    if (priceAtTime === 0) {
      throw new Error('Failed to fetch crypto price');
    }

    // Calculate payout (cryptoAmount × current multiplier)
    const cryptoPayout = parseFloat((bet.cryptoAmount * currentMultiplier).toFixed(8));

    // Record the cashout
    const cashout = {
      playerId,
      multiplier: currentMultiplier,
      cryptoPayout,
    };
    currentRound.cashouts.push(cashout);

    // Update player's wallet
    const currency = bet.currency;
    player.wallet[currency] = parseFloat(((player.wallet[currency] || 0) + cryptoPayout).toFixed(8));

    // Save the updated player and round
    await player.save({ session });
    await currentRound.save({ session });

    // Log the transaction
    const transaction = new Transaction({
      playerId,
      usdAmount: await convertCryptoToUsd(cryptoPayout, currency),
      cryptoAmount: cryptoPayout,
      currency,
      transactionType: 'cashout',
      transactionHash: generateTransactionHash(),
      priceAtTime,
    });
    await transaction.save({ session });

    // Commit the transaction
    await session.commitTransaction();

    // Calculate USD equivalent of the payout
    const usdPayout = await convertCryptoToUsd(cryptoPayout, currency);

    res.status(200).json({
      message: 'Cashed out successfully',
      cashout: {
        ...cashout,
        usdAmount: bet.usdAmount,
      },
      roundId: currentRound.roundId,
      usdPayout,
      updatedWallet: player.wallet,
    });
  } catch (err) {
    await session.abortTransaction();
    res.status(400).json({ error: 'Failed to cash out', details: err.message }); // Changed to 400 for client-side errors
  } finally {
    session.endSession();
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Set up WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('New WebSocket client connected');
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});