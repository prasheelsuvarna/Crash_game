import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const Home = ({ setPlayer }) => {
  const [playerId, setPlayerId] = useState('');
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

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

  // Create player
  const createPlayer = async () => {
    setIsLoading(true);
    try {
      const response = await axios.post('http://localhost:3000/player', {
        playerId,
        username,
      });
      setMessage('Player created successfully');
      setMessageType('success');
      setPlayer({ playerId, username });
      navigate('/profile');
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message;
      if (errorMessage.includes('E11000 duplicate key error')) {
        setMessage('Player already exists');
      } else {
        setMessage('Error creating player: ' + errorMessage);
      }
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  // Login with existing player
  const loginPlayer = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get(`http://localhost:3000/balance/${playerId}`);
      if (response.status === 200) {
        setMessage('Login successful');
        setMessageType('success');
        setPlayer({ playerId, username });
        navigate('/profile');
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setMessage('Player not found');
      } else {
        setMessage('Error logging in: ' + (err.response?.data?.error || err.message));
      }
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <h1 className="app-title">Crypto Crash</h1>
      <div className="section">
        <h2 className="section-title">Welcome to Crypto Crash</h2>
        <input
          type="text"
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
          placeholder="Player ID"
          className="input-field"
          disabled={isLoading}
        />
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          className="input-field"
          disabled={isLoading}
        />
        <div>
          <button
            onClick={createPlayer}
            className="deposit-button"
            disabled={isLoading || !playerId || !username}
          >
            {isLoading ? 'Creating...' : 'Create Player'}
          </button>
          <button
            onClick={loginPlayer}
            className="bet-button"
            disabled={isLoading || !playerId || !username}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </div>
        {message && <p className={messageType === 'success' ? 'message-success' : 'message-error'}>{message}</p>}
      </div>
    </div>
  );
};

export default Home;