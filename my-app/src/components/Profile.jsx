import { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';

const Profile = ({ player, wallet, setWallet }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [depositAmount, setDepositAmount] = useState('');
  const [depositCurrency, setDepositCurrency] = useState('BTC');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  // Fetch wallet balance
  const fetchBalance = async () => {
    try {
      const response = await axios.get(`http://localhost:3000/balance/${player.playerId}`);
      setWallet(response.data.wallet);
    } catch (err) {
      console.error('Error fetching balance:', err.response?.data?.error || err.message);
    }
  };

  // Initial fetch and periodic balance updates
  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, [player.playerId]);

  // Ensure player is logged in
  useEffect(() => {
    if (!player) {
      navigate('/', { state: { message: 'Please log in first', messageType: 'error' } });
    }
  }, [player, navigate]);

  // Extract message and messageType from navigation state
  const navigationMessage = location.state?.message || '';
  const navigationMessageType = location.state?.messageType || '';

  // Handle deposit
  const handleDeposit = async () => {
    setIsLoading(true);
    try {
      const response = await axios.post('http://localhost:3000/deposit', {
        playerId: player.playerId,
        cryptoAmount: parseFloat(depositAmount),
        currency: depositCurrency,
      });
      setMessage('Deposit successful');
      setMessageType('success');
      fetchBalance();
      setDepositAmount('');
    } catch (err) {
      setMessage('Error depositing funds: ' + (err.response?.data?.error || err.message));
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  // Clear message after 3 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage('');
        setMessageType('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  return (
    <div className="app-container">
      <h1 className="app-title">Player Profile</h1>

      {/* Display message if present */}
      {navigationMessage && (
        <div className={navigationMessageType === 'error' ? 'message-error' : 'message-success'}>
          {navigationMessage}
        </div>
      )}

      <div className="section">
        <h2 className="section-title">Welcome, {player.username}!</h2>
        <p>Player ID: {player.playerId}</p>
      </div>
      <div className="section">
        <h2 className="section-title">Wallet Balance</h2>
        <p>BTC: {wallet.BTC.crypto} (~${wallet.BTC.usd})</p>
        <p>ETH: {wallet.ETH.crypto} (~${wallet.ETH.usd})</p>
      </div>
      <div className="section">
        <h2 className="section-title">Deposit Funds</h2>
        <input
          type="number"
          value={depositAmount}
          onChange={(e) => setDepositAmount(e.target.value)}
          placeholder="Amount (in crypto)"
          className="input-field"
          disabled={isLoading}
        />
        <select
          value={depositCurrency}
          onChange={(e) => setDepositCurrency(e.target.value)}
          className="select-field"
          disabled={isLoading}
        >
          <option value="BTC">BTC</option>
          <option value="ETH">ETH</option>
        </select>
        <button
          onClick={handleDeposit}
          className="deposit-button"
          disabled={isLoading}
        >
          {isLoading ? 'Depositing...' : 'Deposit'}
        </button>
        {message && <p className={messageType === 'success' ? 'message-success' : 'message-error'}>{message}</p>}
      </div>
      <div className="section">
        <button
          onClick={() => navigate('/game')}
          className="arena-button"
        >
          Enter Gaming Arena
        </button>
      </div>
    </div>
  );
};

export default Profile;
