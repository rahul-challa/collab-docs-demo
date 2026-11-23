import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { api, getToken, setToken } from './api.js';
import Login from './pages/Login.jsx';
import DocList from './pages/DocList.jsx';
import EditorPage from './pages/EditorPage.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const navigate = useNavigate();

  useEffect(() => {
    if (getToken()) {
      api.me().then(setUser).catch(() => setToken(null)).finally(() => setLoading(false));
    }
    const onLogout = () => setUser(null);
    window.addEventListener('ajaia:logout', onLogout);
    return () => window.removeEventListener('ajaia:logout', onLogout);
  }, []);

  async function handleLogin(email) {
    const { token, user } = await api.login(email);
    setToken(token);
    setUser(user);
  }

  async function handleLogout() {
    await api.logout().catch(() => {});
    setToken(null);
    setUser(null);
    navigate('/');
  }

  if (loading) return <div className="center muted">Loading…</div>;
  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="logo" aria-hidden>▤</span> Ajaia Docs
        </Link>
        <div className="topbar-user">
          <span className="avatar" title={user.email}>{user.name[0]}</span>
          <span className="hide-sm">{user.name}</span>
          <button className="btn btn-ghost" onClick={handleLogout}>Switch user</button>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<DocList user={user} />} />
        <Route path="/docs/:id" element={<EditorPage user={user} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
