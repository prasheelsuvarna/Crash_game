const mongoose = require('mongoose');

const gameRoundSchema = new mongoose.Schema({
  roundId: { type: String, required: true, unique: true },
  startTime: { type: Date, required: true },
  crashPoint: { type: Number, default: null }, // Set when round crashes
  bets: [
    {
      playerId: { type: String, required: true },
      usdAmount: { type: Number, required: true },
      cryptoAmount: { type: Number, required: true },
      currency: { type: String, enum: ['BTC', 'ETH'], required: true },
    },
  ],
  cashouts: [
    {
      playerId: { type: String, required: true },
      multiplier: { type: Number, required: true },
      cryptoPayout: { type: Number, required: true },
    },
  ],
  status: {
    type: String,
    enum: ['active', 'crashed'],
    default: 'active',
  },
});

module.exports = mongoose.model('GameRound', gameRoundSchema);