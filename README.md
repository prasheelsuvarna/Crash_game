# Crypto Crash Backend Developer Assignment

## Overview
This project implements a backend for the "Crypto Crash" game, where players bet in USD (converted to BTC/ETH using real-time prices), watch a multiplier increase, and cash out before the game crashes. The backend handles game logic, cryptocurrency transactions, and real-time updates using WebSockets. A React frontend is included for extra credit.

## Features
- **Game Logic**: Rounds start every 10 seconds, with a multiplier increasing until a random crash point. Players can bet in USD and cash out before the crash.
- **Cryptocurrency Integration**: Uses CoinGecko API to fetch real-time BTC/ETH prices. Bets are converted to crypto, and wallets are simulated in MongoDB.
- **WebSockets**: Real-time updates for round start, multiplier changes, and crash events using the `ws` library.
- **Frontend UI**: A React app with pages for player creation, profile viewing, and game interaction.

## Setup Instructions

### Prerequisites
- Node.js (v16 or higher)
- MongoDB (local or cloud instance, e.g., MongoDB Atlas)
- Git

### Installation
1. **Clone the Repository**:
   ```bash
   git clone https://github.com/prasheelsuvarna/Crash_game.git
   cd crypto-crash
   ```

2. **Backend Setup**:

     ```
   - Install dependencies:
     ```bash
     npm install
     ```
   - Create a `.env` file in the `backend` directory:
     ```
     MONGODB_URI=mongodb://localhost:27017/crypto_crash
     PORT=3000
     ```
     - Replace `MONGODB_URI` with your MongoDB connection string.
   - Start the backend server:
     ```bash
     npm start
     ```

3. **Frontend Setup** :
   - Navigate to the frontend directory:
     ```bash
     cd my-app
     ```
   - Install dependencies:
     ```bash
     npm install
     ```
   - Start the Vite development server:
     ```bash
     npm run dev
     ```
   - Open the URL provided (e.g., `http://localhost:5173`).

### Crypto API Setup
- This project uses the CoinGecko API, which is free and requires no API key.
- The backend fetches prices via:
  ```
  https://api.coingecko.com/api/v3/simple/price?ids=<coin>&vs_currencies=usd
  ```
- Prices are cached for 10 seconds to avoid rate limits.

## API Endpoints

| Endpoint             | Method | Description                       | Request Body                                      | Response                                   |
|----------------------|--------|-----------------------------------|--------------------------------------------------|--------------------------------------------|
| `/`                  | GET    | Welcome message                  | -                                                | `{ "message": "Welcome to Crypto Crash API" }` |
| `/health`            | GET    | Health check                     | -                                                | `{ "status": "OK", "message": "Server is running" }` |
| `/player`            | POST   | Create a player                  | `{ "playerId": "player1", "username": "JohnDoe" }` | `{ "message": "Player created", "player": {...} }` |
| `/balance/:playerId` | GET    | Check player's wallet balance    | -                                                | `{ "wallet": { "BTC": { "crypto": 0.001, "usd": 60 }, "ETH": {...} } }` |
| `/deposit`           | POST   | Deposit funds into wallet        | `{ "playerId": "player1", "cryptoAmount": 0.001, "currency": "BTC" }` | `{ "message": "Deposit successful", "deposit": {...}, "updatedWallet": {...} }` |
| `/bet`               | POST   | Place a bet                      | `{ "playerId": "player1", "usdAmount": 10, "currency": "BTC" }` | `{ "message": "Bet placed", "bet": {...}, "status": "queued", "roundId": null }` |
| `/cashout`           | POST   | Cash out from the current round  | `{ "playerId": "player1" }`                      | `{ "message": "Cashed out successfully", "cashout": {...}, "roundId": "...", "usdPayout": 20, "updatedWallet": {...} }` |

## WebSocket Events

| Event/Message Type         | Payload Example                                                                 | Description                             |
|----------------------------|---------------------------------------------------------------------------------|-----------------------------------------|
| Multiplier Update          | `{ "multiplier": 1.5 }`                                                        | Sent every 500ms with the current multiplier. |
| Crash Event                | `{ "multiplier": 5.23, "crashed": true, "playersWhoDidntCashOut": ["player1"] }` | Sent when the round crashes, listing players who lost. |
| New Round                  | `{ "newRound": true, "roundId": "round_1623456789012" }`                        | Sent when a new round starts.           |
| Player Entered             | `{ "message": "Player player1 entered", "roundId": "round_1623456789012" }`     | Sent when a player’s bet is applied to a round. |
| Player Waiting             | `{ "message": "Player player1 waiting to enter", "bet": {...} }`                | Sent when a bet is queued for the next round. |
| Countdown After Crash      | `{ "message": "Game crashed, wait for 5 seconds till next round starts", "countdown": 5 }` | Sent every second after a crash until the next round. |

## Provably Fair Crash Algorithm
- **Current Implementation**: The crash point is generated using `Math.random()` between 1.1x and 10x:
  ```javascript
  const calculateCrashPoint = () => {
    const min = 1.1;
    const max = 10.0;
    return parseFloat((Math.random() * (max - min) + min).toFixed(2));
  };
  ```

## USD-to-Crypto Conversion Logic
- **Price Fetching**: Real-time prices are fetched from CoinGecko and cached for 10 seconds.
- **Conversion**:
  - Bet: USD to crypto using the price at the time of the bet (e.g., $10 at $60,000/BTC = 0.00016667 BTC).
  - Cashout: Crypto payout multiplied by the current multiplier, converted back to USD for display (e.g., 0.00016667 BTC * 2x = 0.00033334 BTC, $20 at $60,000/BTC).
- **Transaction Logging**: Each bet and cashout is logged in MongoDB with USD, crypto amount, price at the time, and a mock transaction hash.

## Approach
- **Game Logic**: Rounds are managed using a `GameRound` model in MongoDB. Bets are queued in `pendingBets` and applied when a round starts. The multiplier increases every 500ms until the crash point.
- **Crypto Integration**: CoinGecko API provides real-time prices. Player wallets are stored in MongoDB, and transactions are atomic using Mongoose sessions.
- **WebSockets**: The `ws` library broadcasts game events to all connected clients. Multiplier updates are sent every 500ms, though the assignment requires 100ms updates (a potential improvement).
- **Frontend**: A React app with Vite provides a UI for player creation, wallet management, and gameplay, going beyond the basic WebSocket client requirement.

## Sample Data Script
To populate the database with sample data, run the following script in the `backend` directory:

**`populate.js`**:
```javascript
const mongoose = require('mongoose');
const Player = require('./models/Player');
const GameRound = require('./models/GameRound');

mongoose.connect('mongodb://localhost:27017/crypto_crash')
  .then(async () => {
    console.log('Connected to MongoDB');

    // Create sample players
    await Player.insertMany([
      { playerId: 'player1', username: 'JohnDoe', wallet: { BTC: 0.01, ETH: 0.1 } },
      { playerId: 'player2', username: 'JaneDoe', wallet: { BTC: 0.02, ETH: 0.05 } },
      { playerId: 'player3', username: 'Alice', wallet: { BTC: 0.005, ETH: 0.2 } },
    ]);
    console.log('Sample players created');

    // Create sample game rounds
    await GameRound.insertMany([
      {
        roundId: 'round_1',
        startTime: new Date(),
        crashPoint: 2.5,
        status: 'crashed',
        bets: [{ playerId: 'player1', usdAmount: 10, cryptoAmount: 0.00016667, currency: 'BTC' }],
        cashouts: [],
      },
      {
        roundId: 'round_2',
        startTime: new Date(),
        crashPoint: 1.8,
        status: 'crashed',
        bets: [{ playerId: 'player2', usdAmount: 20, cryptoAmount: 0.00033334, currency: 'BTC' }],
        cashouts: [{ playerId: 'player2', multiplier: 1.5, cryptoPayout: 0.0005 }],
      },
    ]);
    console.log('Sample game rounds created');

    mongoose.connection.close();
  })
  .catch(err => console.error('Error:', err));
```

Run the script:
```bash
node populate.js
```

## Testing with Postman/cURL

### Create a Player
```bash
curl -X POST http://localhost:3000/player \
-H "Content-Type: application/json" \
-d '{"playerId": "player1", "username": "JohnDoe"}'
```

### Check Balance
```bash
curl http://localhost:3000/balance/player1
```

### Deposit Funds
```bash
curl -X POST http://localhost:3000/deposit \
-H "Content-Type: application/json" \
-d '{"playerId": "player1", "cryptoAmount": 0.001, "currency": "BTC"}'
```

### Place a Bet
```bash
curl -X POST http://localhost:3000/bet \
-H "Content-Type: application/json" \
-d '{"playerId": "player1", "usdAmount": 10, "currency": "BTC"}'
```

### Cash Out
```bash
curl -X POST http://localhost:3000/cashout \
-H "Content-Type: application/json" \
-d '{"playerId": "player1"}'
```

## Basic WebSocket Client
A React frontend is provided, but for a basic WebSocket client, you can use this HTML page:

**`ws-client.html`**:
```html
<!DOCTYPE html>
<html>
<head>
  <title>WebSocket Client</title>
</head>
<body>
  <h1>Crypto Crash WebSocket Client</h1>
  <p>Messages: <span id="messages"></span></p>
  <script>
    const ws = new WebSocket('ws://localhost:3000');
    ws.onopen = () => console.log('WebSocket connected');
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      document.getElementById('messages').innerText += JSON.stringify(data) + '\n';
    };
    ws.onerror = (error) => console.error('WebSocket error:', error);
    ws.onclose = () => console.log('WebSocket disconnected');
  </script>
</body>
</html>
```




