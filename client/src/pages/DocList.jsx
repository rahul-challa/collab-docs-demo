import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, SUPPORTED_UPLOADS, SUPPORTED_UPLOADS_LABEL } from '../api.js';
import { formatDate } from '../format.js';

export default function DocList() {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);
  const navigate = useNavigate();

  const load = () => api.listDocs().then(setDocs).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const createDoc = () => run(async () => navigate(`/docs/${(await api.createDoc()).id}`));

  const importFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) run(async () => navigate(`/docs/${(await api.importDoc(file)).id}`));
  };

  const deleteDoc = (doc) => {
    if (!window.confirm(`Delete "${doc.title}"? This also removes access for anyone it is shared with.`)) return;
    run(async () => {
      await api.deleteDoc(doc.id);
      await load();
    });
  };

  return (
    <main className="page">
      <div className="page-head">
        <h1>Documents</h1>
        <div className="actions">
          <button className="btn" onClick={() => fileInput.current.click()} disabled={busy}>
            Import file
          </button>
          <button className="btn btn-primary" onClick={createDoc} disabled={busy}>
            + New document
          </button>
          <input ref={fileInput} type="file" accept={SUPPORTED_UPLOADS} hidden onChange={importFile} />
        </div>
      </div>
      <p className="muted small hint">Import creates a new document from a {SUPPORTED_UPLOADS_LABEL} file.</p>
      {error && <p className="error" role="alert">{error}</p>}

      {!docs ? (
        !error && <p className="muted">Loading…</p>
      ) : (
        <>
          <section>
            <h2>My documents</h2>
            {docs.owned.length === 0 ? (
              <p className="empty">No documents yet. Create one or import a file.</p>
            ) : (
              <ul className="doc-list">
                {docs.owned.map((d) => (
                  <li key={d.id}>
                    <Link to={`/docs/${d.id}`} className="doc-link">
                      <span className="doc-icon" aria-hidden>▤</span>
                      <span className="doc-title">{d.title}</span>
                      {d.shareCount > 0 && (
                        <span className="badge">Shared with {d.shareCount}</span>
                      )}
                      <span className="muted small">Edited {formatDate(d.updatedAt)}</span>
                    </Link>
                    <button className="btn btn-ghost btn-sm" onClick={() => deleteDoc(d)} disabled={busy}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2>Shared with me</h2>
            {docs.shared.length === 0 ? (
              <p className="empty">Nothing shared with you yet.</p>
            ) : (
              <ul className="doc-list">
                {docs.shared.map((d) => (
                  <li key={d.id}>
                    <Link to={`/docs/${d.id}`} className="doc-link">
                      <span className="doc-icon shared" aria-hidden>▤</span>
                      <span className="doc-title">{d.title}</span>
                      <span className={`badge badge-${d.role}`}>{d.role === 'editor' ? 'Can edit' : 'View only'}</span>
                      <span className="muted small">
                        Owner: {d.ownerName} · Edited {formatDate(d.updatedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
