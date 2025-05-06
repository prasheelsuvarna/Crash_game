const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  playerId: { type: String, required: true },
  usdAmount: { type: Number, required: true },
  cryptoAmount: { type: Number, required: true },
  currency: { type: String, enum: ['BTC', 'ETH'], required: true },
  transactionType: { type: String, enum: ['bet', 'cashout', 'deposit'], required: true }, // Added 'deposit'
  transactionHash: { type: String, required: true },
  priceAtTime: { type: Number, required: true }, // USD per crypto at the time of transaction
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Transaction', TransactionSchema);