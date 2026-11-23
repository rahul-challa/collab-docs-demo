import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import {
  sanitizeContent,
  fileToHtml,
  titleFromFilename,
  MAX_TITLE_LENGTH,
  MAX_CONTENT_BYTES,
  MAX_UPLOAD_BYTES,
  SUPPORTED_EXTENSIONS,
} from './content.js';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const ROLE_RANK = { viewer: 1, editor: 2, owner: 3 };

/**
 * Builds the Express app around an already-open database handle.
 * Kept separate from index.js so tests can run against an in-memory DB.
 */
export function createApp(db, { clientDist } = {}) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  });

  // ---------- helpers ----------

  const q = {
    userByEmail: db.prepare('SELECT id, email, name FROM users WHERE email = ?'),
    userBySession: db.prepare(
      'SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?',
    ),
    insertSession: db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
    allUsers: db.prepare('SELECT id, email, name FROM users ORDER BY name'),
    doc: db.prepare(
      `SELECT d.id, d.title, d.content, d.version, d.created_at, d.updated_at,
              d.owner_id, u.name AS owner_name, u.email AS owner_email
         FROM documents d JOIN users u ON u.id = d.owner_id WHERE d.id = ?`,
    ),
    shareRole: db.prepare('SELECT role FROM document_shares WHERE document_id = ? AND user_id = ?'),
    ownedDocs: db.prepare(
      `SELECT d.id, d.title, d.updated_at,
              (SELECT COUNT(*) FROM document_shares s WHERE s.document_id = d.id) AS share_count
         FROM documents d WHERE d.owner_id = ? ORDER BY d.updated_at DESC, d.id DESC`,
    ),
    sharedDocs: db.prepare(
      `SELECT d.id, d.title, d.updated_at, s.role, u.name AS owner_name
         FROM document_shares s
         JOIN documents d ON d.id = s.document_id
         JOIN users u ON u.id = d.owner_id
        WHERE s.user_id = ? ORDER BY d.updated_at DESC, d.id DESC`,
    ),
    sharesForDoc: db.prepare(
      `SELECT u.id AS user_id, u.email, u.name, s.role
         FROM document_shares s JOIN users u ON u.id = s.user_id
        WHERE s.document_id = ? ORDER BY u.name`,
    ),
    insertDoc: db.prepare('INSERT INTO documents (owner_id, title, content) VALUES (?, ?, ?)'),
    updateDoc: db.prepare(
      `UPDATE documents SET title = ?, content = ?, version = version + 1, updated_at = datetime('now')
        WHERE id = ? AND version = ?`,
    ),
    deleteDoc: db.prepare('DELETE FROM documents WHERE id = ?'),
    upsertShare: db.prepare(
      `INSERT INTO document_shares (document_id, user_id, role) VALUES (?, ?, ?)
       ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role`,
    ),
    deleteShare: db.prepare('DELETE FROM document_shares WHERE document_id = ? AND user_id = ?'),
  };

  function parseId(raw) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'Document not found');
    return id;
  }

  function validateTitle(title) {
    if (typeof title !== 'string') throw new HttpError(400, 'Title must be a string');
    const t = title.trim();
    if (!t) throw new HttpError(400, 'Title cannot be empty');
    if (t.length > MAX_TITLE_LENGTH) throw new HttpError(400, `Title must be ${MAX_TITLE_LENGTH} characters or fewer`);
    return t;
  }

  function validateContent(content) {
    if (typeof content !== 'string') throw new HttpError(400, 'Content must be a string');
    if (Buffer.byteLength(content) > MAX_CONTENT_BYTES) throw new HttpError(413, 'Document is too large');
    return sanitizeContent(content);
  }

  /**
   * Loads a document and the caller's role on it, enforcing a minimum role.
   * Users with no access get 404 (not 403) so document IDs don't leak existence.
   */
  function loadDoc(docId, user, minRole = 'viewer') {
    const doc = q.doc.get(docId);
    if (!doc) throw new HttpError(404, 'Document not found');
    const role = doc.owner_id === user.id ? 'owner' : q.shareRole.get(docId, user.id)?.role;
    if (!role) throw new HttpError(404, 'Document not found');
    if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
      throw new HttpError(403, minRole === 'owner' ? 'Only the owner can do that' : 'You have view-only access');
    }
    return { doc, role };
  }

  function serializeDoc(doc, role) {
    return {
      id: doc.id,
      title: doc.title,
      content: doc.content,
      version: doc.version,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
      owner: { id: doc.owner_id, name: doc.owner_name, email: doc.owner_email },
      role,
      shares: role === 'owner' ? q.sharesForDoc.all(doc.id).map(toShare) : undefined,
    };
  }

  const toShare = (s) => ({ userId: s.user_id, email: s.email, name: s.name, role: s.role });

  function requireAuth(req, _res, next) {
    const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
    const user = token && q.userBySession.get(token);
    if (!user) return next(new HttpError(401, 'Please sign in'));
    req.user = user;
    req.token = token;
    next();
  }

  // ---------- auth (mocked: seeded accounts, no passwords) ----------

  const api = express.Router();

  api.get('/health', (_req, res) => res.json({ ok: true }));

  api.get('/auth/accounts', (_req, res) => res.json(q.allUsers.all()));

  api.post('/auth/login', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const user = q.userByEmail.get(email);
    if (!user) throw new HttpError(401, 'Unknown account. Use one of the demo accounts.');
    const token = crypto.randomBytes(24).toString('hex');
    q.insertSession.run(token, user.id);
    res.json({ token, user });
  });

  api.use(requireAuth);

  api.post('/auth/logout', (req, res) => {
    q.deleteSession.run(req.token);
    res.status(204).end();
  });

  api.get('/me', (req, res) => res.json(req.user));

  api.get('/users', (req, res) => res.json(q.allUsers.all().filter((u) => u.id !== req.user.id)));

  // ---------- documents ----------

  api.get('/documents', (req, res) => {
    res.json({
      owned: q.ownedDocs.all(req.user.id).map((d) => ({
        id: d.id, title: d.title, updatedAt: d.updated_at, shareCount: d.share_count,
      })),
      shared: q.sharedDocs.all(req.user.id).map((d) => ({
        id: d.id, title: d.title, updatedAt: d.updated_at, role: d.role, ownerName: d.owner_name,
      })),
    });
  });

  api.post('/documents', (req, res) => {
    const title = req.body?.title === undefined ? 'Untitled document' : validateTitle(req.body.title);
    const content = req.body?.content === undefined ? '' : validateContent(req.body.content);
    const { lastInsertRowid } = q.insertDoc.run(req.user.id, title, content);
    res.status(201).json(serializeDoc(q.doc.get(Number(lastInsertRowid)), 'owner'));
  });

  // Upload behaviour 1: turn a file into a brand-new document.
  api.post('/documents/import', upload.single('file'), async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Choose a file to upload');
    const content = await fileToHtml(req.file.originalname, req.file.buffer);
    const { lastInsertRowid } = q.insertDoc.run(req.user.id, titleFromFilename(req.file.originalname), content);
    res.status(201).json(serializeDoc(q.doc.get(Number(lastInsertRowid)), 'owner'));
  });

  // Upload behaviour 2: convert a file to HTML so the editor can insert it into the open draft.
  // Nothing is persisted here; the normal save path stores the result (with its access checks).
  api.post('/convert', upload.single('file'), async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Choose a file to upload');
    res.json({ content: await fileToHtml(req.file.originalname, req.file.buffer) });
  });

  api.get('/documents/:id', (req, res) => {
    const { doc, role } = loadDoc(parseId(req.params.id), req.user);
    res.json(serializeDoc(doc, role));
  });

  /**
   * Partial update with optimistic concurrency: the client sends the `version` it last saw.
   * If someone else saved in between we return 409 with the latest copy instead of silently
   * overwriting their work.
   */
  api.patch('/documents/:id', (req, res) => {
    const { doc, role } = loadDoc(parseId(req.params.id), req.user, 'editor');
    const { title, content, version } = req.body ?? {};
    if (!Number.isInteger(version)) throw new HttpError(400, 'version is required');
    if (title === undefined && content === undefined) throw new HttpError(400, 'Nothing to update');

    const nextTitle = title === undefined ? doc.title : validateTitle(title);
    const nextContent = content === undefined ? doc.content : validateContent(content);

    const { changes } = q.updateDoc.run(nextTitle, nextContent, doc.id, version);
    if (changes === 0) {
      return res.status(409).json({
        error: 'This document was changed by someone else. Reload to get the latest version.',
        document: serializeDoc(q.doc.get(doc.id), role),
      });
    }
    res.json(serializeDoc(q.doc.get(doc.id), role));
  });

  api.delete('/documents/:id', (req, res) => {
    const { doc } = loadDoc(parseId(req.params.id), req.user, 'owner');
    q.deleteDoc.run(doc.id);
    res.status(204).end();
  });

  // ---------- sharing (owner only) ----------

  api.put('/documents/:id/shares', (req, res) => {
    const { doc } = loadDoc(parseId(req.params.id), req.user, 'owner');
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const role = req.body?.role ?? 'editor';
    if (!['viewer', 'editor'].includes(role)) throw new HttpError(400, 'Role must be viewer or editor');
    const target = q.userByEmail.get(email);
    if (!target) throw new HttpError(404, `No user with email ${email || '(empty)'}`);
    if (target.id === doc.owner_id) throw new HttpError(400, 'The owner already has full access');
    q.upsertShare.run(doc.id, target.id, role);
    res.json(q.sharesForDoc.all(doc.id).map(toShare));
  });

  api.delete('/documents/:id/shares/:userId', (req, res) => {
    const { doc } = loadDoc(parseId(req.params.id), req.user, 'owner');
    q.deleteShare.run(doc.id, Number(req.params.userId));
    res.json(q.sharesForDoc.all(doc.id).map(toShare));
  });

  api.use((_req, _res, next) => next(new HttpError(404, 'Not found')));

  app.use('/api', api);

  // ---------- static client (production) ----------

  if (clientDist && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // SPA fallback so deep links like /docs/3 survive a refresh.
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  // ---------- errors ----------

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const msg =
        err.code === 'LIMIT_FILE_SIZE'
          ? `File is too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)`
          : 'Upload failed';
      return res.status(400).json({ error: msg });
    }
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    const status = err.status ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message });
  });

  return app;
}

export { SUPPORTED_EXTENSIONS };
