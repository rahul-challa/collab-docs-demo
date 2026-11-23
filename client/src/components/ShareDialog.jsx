import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function ShareDialog({ docId, shares, onChange, onClose }) {
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.users().then(setUsers).catch(() => {});
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      onChange(await action());
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!email.trim()) return setError('Enter an email address');
    if (await run(() => api.share(docId, email.trim(), role))) setEmail('');
  }

  const sharedIds = new Set(shares.map((s) => s.userId));
  const suggestions = users.filter((u) => !sharedIds.has(u.id));

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="share-title" onMouseDown={(e) => e.stopPropagation()}>
        <h2 id="share-title">Share document</h2>
        <form className="share-form" onSubmit={submit}>
          <input
            type="email"
            list="share-users"
            placeholder="Add people by email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            aria-label="Email address"
          />
          <datalist id="share-users">
            {suggestions.map((u) => (
              <option key={u.id} value={u.email}>{u.name}</option>
            ))}
          </datalist>
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Access level">
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
          <button className="btn btn-primary" disabled={busy}>Share</button>
        </form>
        {suggestions.length > 0 && (
          <p className="muted small">
            Demo accounts: {suggestions.map((u) => (
              <button key={u.id} type="button" className="link-btn" onClick={() => setEmail(u.email)}>
                {u.email}
              </button>
            ))}
          </p>
        )}
        {error && <p className="error" role="alert">{error}</p>}

        <h3>People with access</h3>
        <ul className="share-list">
          <li>
            <span className="muted">You</span>
            <span className="muted small">Owner</span>
          </li>
          {shares.map((s) => (
            <li key={s.userId}>
              <span>
                {s.name} <span className="muted small">{s.email}</span>
              </span>
              <span className="share-actions">
                <select
                  value={s.role}
                  disabled={busy}
                  onChange={(e) => run(() => api.share(docId, s.email, e.target.value))}
                  aria-label={`Access for ${s.name}`}
                >
                  <option value="editor">Can edit</option>
                  <option value="viewer">Can view</option>
                </select>
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => api.unshare(docId, s.userId))}>
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
