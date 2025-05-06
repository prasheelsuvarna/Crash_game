import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import Profile from './components/Profile';
import Game from './components/Game';
import './App.css';

const App = () => {
  const [player, setPlayer] = useState(null);
  const [wallet, setWallet] = useState({ BTC: { crypto: 0, usd: 0 }, ETH: { crypto: 0, usd: 0 } });

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home setPlayer={setPlayer} />} />
        <Route path="/profile" element={<Profile player={player} wallet={wallet} setWallet={setWallet} />} />
        <Route path="/game" element={<Game player={player} wallet={wallet} setWallet={setWallet} setPlayer={setPlayer} />} />
      </Routes>
    </Router>
  );
};

export default App;