import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const Game = ({ player, wallet, setWallet }) => {
  const [multiplier, setMultiplier] = useState(1.0);
  const [roundId, setRoundId] = useState(null);
  const [roundStatus, setRoundStatus] = useState('waiting');
  const [betStatus, setBetStatus] = useState(null);
  const [currentBetAmount, setCurrentBetAmount] = useState(0);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [countdownMessage, setCountdownMessage] = useState('');
  const [depositCurrency, setDepositCurrency] = useState('BTC'); // Default currency for backend
  const [betAmount, setBetAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const ws = useRef(null);
  const [showPopup, setShowPopup] = useState(false);
  const [cashoutDetails, setCashoutDetails] = useState({ betAmount: 0, profit: 0 });

  const navigate = useNavigate();

  useEffect(() => {
    if (message && message !== 'Bet will be placed for the next round') {
      const timer = setTimeout(() => {
        setMessage('');
        setMessageType('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  useEffect(() => {
    let reconnectTimeout = null;

    const connectWebSocket = () => {
      ws.current = new WebSocket('ws://localhost:3000');
      ws.current.onopen = () => {
        console.log('WebSocket connected');
      };
      ws.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('WebSocket message received:', data);
        console.log('Current betStatus:', betStatus);

        if (data.multiplier) {
          setMultiplier(data.multiplier);
          if (data.crashed) {
            setRoundStatus('crashed');
            console.log('Crash detected, players who didn’t cash out:', data.playersWhoDidntCashOut);
            if (data.playersWhoDidntCashOut && data.playersWhoDidntCashOut.includes(player.playerId)) {
              console.log(`Player ${player.playerId} lost the bet, redirecting to profile`);
              setBetStatus(null);
              setCurrentBetAmount(0);
              navigate('/profile', {
                state: {
                  message: 'You lost',
                  messageType: 'error',
                },
              });
              if (ws.current) {
                ws.current.close();
              }
            }
          }
        }

        if (data.newRound) {
          setRoundId(data.roundId);
          setRoundStatus('active');
          setMultiplier(1.0);
          setCountdownMessage('');
          if (betStatus === 'entered') {
            setBetStatus(null);
            setCurrentBetAmount(0);
          }
        }

        if (data.message) {
          if (data.message.includes('Game crashed')) {
            setCountdownMessage(data.message);
          } else if (data.message.includes('entered')) {
            if (data.message.includes(player.playerId)) {
              setMessage('Player entered');
              setMessageType('success');
              setBetStatus('entered');
              console.log(`Set betStatus to entered for player ${player.playerId}`);
            }
          } else if (data.message.includes('waiting to enter')) {
            if (data.message.includes(player.playerId)) {
              setMessage('Bet will be placed for the next round');
              setMessageType('success');
              setBetStatus('queued');
              console.log(`Set betStatus to queued for player ${player.playerId}`);
            }
          } else {
            setMessage(data.message);
            setMessageType('error');
          }
        }
      };
      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
      ws.current.onclose = () => {
        console.log('WebSocket disconnected');
        ws.current = null;
        reconnectTimeout = setTimeout(connectWebSocket, 5000);
      };
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [player.playerId, navigate]);

  const fetchBalance = async () => {
    try {
      const response = await axios.get(`http://localhost:3000/balance/${player.playerId}`);
      setWallet(response.data.wallet);
    } catch (err) {
      setMessage('Error fetching balance: ' + (err.response?.data?.error || err.message));
      setMessageType('error');
    }
  };

  const handleBet = async () => {
    setIsLoading(true);
    try {
      const betValue = parseFloat(betAmount);
      // Always send currency as BTC or ETH to backend, default BTC here
      const response = await axios.post('http://localhost:3000/bet', {
        playerId: player.playerId,
        usdAmount: betValue,
        currency: depositCurrency,
      });
      if (roundStatus === 'active') {
        setMessage('Bet will be placed for the next round');
      } else {
        setMessage('Bet placed');
      }
      setMessageType('success');
      setBetStatus(response.data.status);
      setCurrentBetAmount(betValue);
      fetchBalance();
      setBetAmount('');
      console.log(`Bet placed, betStatus: ${response.data.status}, roundStatus: ${roundStatus}`);
    } catch (err) {
      setMessage('Error placing bet: ' + (err.response?.data?.error || err.message));
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCashout = async () => {
    setIsLoading(true);
    try {
      const response = await axios.post('http://localhost:3000/cashout', { playerId: player.playerId });
      setMessage('Cashed out successfully');
      setMessageType('success');
      setBetStatus(null);
      setCurrentBetAmount(0);
      fetchBalance();

      const betUsd = response.data.cashout.usdAmount || 0;
      const payoutUsd = response.data.usdPayout || 0;
      const profit = parseFloat((payoutUsd - betUsd).toFixed(2));

      setCashoutDetails({
        betAmount: parseFloat(betUsd.toFixed(2)),
        profit: profit,
      });
      setShowPopup(true);
      console.log('Cashed out successfully:', response.data);
    } catch (err) {
      setMessage('Error cashing out: ' + (err.response?.data?.error || err.message));
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  const closePopup = () => {
    setShowPopup(false);
    setCashoutDetails({ betAmount: 0, profit: 0 });
  };

  return (
    <div className="app-container">
      <h1 className="app-title">Crypto Crash Arena</h1>

      <div className="section">
        <h2 className="section-title">Wallet Balance</h2>
        <p>BTC: {wallet.BTC.crypto} (~${wallet.BTC.usd})</p>
        <p>ETH: {wallet.ETH.crypto} (~${wallet.ETH.usd})</p>
      </div>

      <div className="section">
        <h2 className="section-title">Game Status</h2>
        <p>Round ID: {roundId || 'N/A'}</p>
        <p>Multiplier: {multiplier}x</p>
        <p>Round Status: {roundStatus}</p>
        <p>Bet Status: {betStatus || 'Not betting'}</p>
        {message && <p className={messageType === 'success' ? 'message-success' : 'message-error'}>{message}</p>}
        {countdownMessage && <p className="message-error">{countdownMessage}</p>}
      </div>

      <div className="section">
        <h2 className="section-title">Place a Bet</h2>
        <div className="bet-input-container">
          <input
            type="number"
            value={betAmount}
            onChange={(e) => setBetAmount(e.target.value)}
            placeholder="Amount"
            className="input-field"
            disabled={isLoading || betStatus === 'queued' || betStatus === 'entered'}
          />
          <span className="currency-label">USD</span>
        </div>
        <button
          onClick={handleBet}
          className="bet-button"
          disabled={isLoading || betStatus === 'queued' || betStatus === 'entered'}
        >
          {isLoading ? 'Placing Bet...' : 'Place Bet'}
        </button>
      </div>

      <div className="section">
        <button
          onClick={handleCashout}
          className="cashout-button"
          disabled={isLoading || betStatus !== 'entered' || roundStatus !== 'active'}
        >
          {isLoading ? 'Cashing Out...' : 'Cash Out'}
        </button>
      </div>

      {showPopup && (
        <div className="popup-overlay">
          <div className="popup-content">
            <h2 className="popup-title">Cashout Details</h2>
            <p>Bet Amount: ${cashoutDetails.betAmount}</p>
            <p>Profit: ${cashoutDetails.profit}</p>
            <p>Total Payout: ${(cashoutDetails.betAmount + cashoutDetails.profit).toFixed(2)}</p>
            <button onClick={closePopup} className="close-button">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Game;
