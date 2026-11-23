import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { api } from '../api.js';
import Toolbar from '../components/Toolbar.jsx';
import ShareDialog from '../components/ShareDialog.jsx';

const AUTOSAVE_DELAY_MS = 800;

/** Loads the document, then mounts the editor. Remounts (via key) when we reload after a conflict. */
export default function EditorPage() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');
  const [mountKey, setMountKey] = useState(0);

  useEffect(() => {
    setDoc(null);
    setError('');
    api.getDoc(id).then(setDoc).catch((e) => setError(e.status === 404 ? 'This document does not exist or you do not have access to it.' : e.message));
  }, [id]);

  if (error)
    return (
      <main className="page">
        <p className="error" role="alert">{error}</p>
        <Link to="/">← Back to documents</Link>
      </main>
    );
  if (!doc) return <div className="center muted">Loading document…</div>;

  return (
    <DocEditor
      key={`${doc.id}:${mountKey}`}
      initial={doc}
      onReplace={(latest) => {
        setDoc(latest);
        setMountKey((k) => k + 1);
      }}
    />
  );
}

function DocEditor({ initial, onReplace }) {
  const canEdit = initial.role !== 'viewer';
  const isOwner = initial.role === 'owner';

  const [title, setTitle] = useState(initial.title);
  const [status, setStatus] = useState('saved'); // saved | unsaved | saving | error | conflict
  const [error, setError] = useState('');
  const [conflictDoc, setConflictDoc] = useState(null);
  const [shares, setShares] = useState(initial.shares ?? []);
  const [shareOpen, setShareOpen] = useState(false);

  // Save pipeline state lives in refs so the editor's onUpdate closure never goes stale.
  const version = useRef(initial.version);
  const savedTitle = useRef(initial.title);
  const pending = useRef({});
  const inFlight = useRef(false);
  const blocked = useRef(false);
  const timer = useRef(null);

  // Serialised saves: at most one request in flight; edits made meanwhile are batched into the next one.
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (inFlight.current || blocked.current || Object.keys(pending.current).length === 0) return;
    const changes = pending.current;
    pending.current = {};
    inFlight.current = true;
    setStatus('saving');
    let retryLater = false;
    try {
      const saved = await api.updateDoc(initial.id, { ...changes, version: version.current });
      version.current = saved.version;
      savedTitle.current = saved.title;
      setError('');
    } catch (e) {
      if (e.status === 409) {
        blocked.current = true;
        setConflictDoc(e.body.document);
        setStatus('conflict');
      } else {
        // Keep the unsaved changes; they will be retried on the next edit or via "Retry".
        pending.current = { ...changes, ...pending.current };
        setError(e.message);
        setStatus('error');
        retryLater = true;
      }
    } finally {
      inFlight.current = false;
    }
    if (blocked.current || retryLater) return;
    if (Object.keys(pending.current).length) flush();
    else setStatus('saved');
  }, [initial.id]);

  const schedule = useCallback(
    (changes) => {
      if (blocked.current) return;
      pending.current = { ...pending.current, ...changes };
      setStatus('unsaved');
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, AUTOSAVE_DELAY_MS);
    },
    [flush],
  );

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: !canEdit } })],
    content: initial.content,
    editable: canEdit,
    onUpdate: ({ editor }) => schedule({ content: editor.getHTML() }),
  });

  // Once we know our copy is stale, stop accepting edits that could never be saved.
  useEffect(() => {
    if (status === 'conflict') editor?.setEditable(false);
  }, [status, editor]);

  // Flush on unmount (navigating back to the list) and warn before closing the tab with unsaved work.
  useEffect(() => {
    const beforeUnload = (e) => {
      if (Object.keys(pending.current).length || inFlight.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      flush();
    };
  }, [flush]);

  // Ctrl/Cmd+S saves immediately instead of opening the browser's save dialog.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        flush();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flush]);

  function onTitleChange(e) {
    setTitle(e.target.value);
    if (e.target.value.trim()) schedule({ title: e.target.value.trim() });
  }

  function onTitleBlur() {
    if (!title.trim()) {
      // Empty titles aren't allowed; restore the last saved one rather than erroring.
      setTitle(savedTitle.current);
      delete pending.current.title;
    } else flush();
  }

  return (
    <main className="editor-page">
      <div className="editor-head">
        <Link to="/" className="btn btn-ghost btn-sm" title="Back to documents">←</Link>
        <input
          className="title-input"
          value={title}
          onChange={onTitleChange}
          onBlur={onTitleBlur}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          readOnly={!canEdit}
          maxLength={200}
          aria-label="Document title"
        />
        <SaveStatus status={status} canEdit={canEdit} onRetry={flush} />
        {isOwner && (
          <button className="btn btn-primary" onClick={() => setShareOpen(true)}>
            Share{shares.length ? ` (${shares.length})` : ''}
          </button>
        )}
      </div>

      {!isOwner && (
        <div className={`banner ${canEdit ? '' : 'banner-info'}`}>
          Shared with you by <strong>{initial.owner.name}</strong> ·{' '}
          {canEdit ? 'You can edit' : 'View only. Ask the owner for edit access to make changes.'}
        </div>
      )}
      {status === 'conflict' && (
        <div className="banner banner-warn" role="alert">
          Someone else saved a newer version while you were editing. Your latest changes were not saved, and editing is paused.{' '}
          <button className="btn btn-sm" onClick={() => onReplace(conflictDoc)}>Load latest version</button>
        </div>
      )}
      {status === 'error' && <div className="banner banner-error" role="alert">Not saved: {error}</div>}

      {canEdit && editor && status !== 'conflict' && <Toolbar editor={editor} onError={setError} />}
      <div className="paper">
        <EditorContent editor={editor} className="editor" />
      </div>

      {shareOpen && (
        <ShareDialog docId={initial.id} shares={shares} onChange={setShares} onClose={() => setShareOpen(false)} />
      )}
    </main>
  );
}

function SaveStatus({ status, canEdit, onRetry }) {
  if (!canEdit) return <span className="save-status muted">Read only</span>;
  const label = {
    saved: 'All changes saved',
    unsaved: 'Unsaved changes',
    saving: 'Saving…',
    error: 'Save failed',
    conflict: 'Out of date',
  }[status];
  return (
    <span className={`save-status status-${status}`} aria-live="polite">
      {label}
      {status === 'error' && (
        <button className="link-btn" onClick={onRetry}>Retry</button>
      )}
    </span>
  );
}
