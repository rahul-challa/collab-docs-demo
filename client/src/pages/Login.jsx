import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Login({ onLogin }) {
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    api.accounts().then(setAccounts).catch((e) => setError(e.message));
  }, []);

  async function choose(email) {
    setBusy(email);
    setError('');
    try {
      await onLogin(email);
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <h1><span className="logo" aria-hidden>▤</span> Collab Docs</h1>
        <p className="muted">
          Demo sign-in: pick a seeded account. Open a second browser (or a private window) as another
          user to try sharing.
        </p>
        <div className="account-list">
          {accounts.map((a) => (
            <button key={a.id} className="account" onClick={() => choose(a.email)} disabled={!!busy}>
              <span className="avatar">{a.name[0]}</span>
              <span>
                <strong>{a.name}</strong>
                <br />
                <span className="muted small">{a.email}</span>
              </span>
              {busy === a.email && <span className="muted small">Signing in…</span>}
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
