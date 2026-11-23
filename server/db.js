import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

// Seeded demo accounts. Auth is intentionally mocked (see docs/ARCHITECTURE.md):
// reviewers pick one of these on the login screen to exercise the sharing flow.
export const SEED_USERS = [
  { email: 'alice@collabdocs.test', name: 'Alice Owner' },
  { email: 'bob@collabdocs.test', name: 'Bob Collaborator' },
  { email: 'carol@collabdocs.test', name: 'Carol Reviewer' },
];

const SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id    INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS documents (
    id         INTEGER PRIMARY KEY,
    owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL DEFAULT '',
    version    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS document_shares (
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (document_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
  CREATE INDEX IF NOT EXISTS idx_shares_user ON document_shares(user_id);
`;

const WELCOME_DOC = `<h1>Welcome to Collab Docs</h1>
<p>This document was <strong>shared with you</strong> by Alice so you can see how sharing works.</p>
<h2>Try these</h2>
<ul><li>Use the toolbar for <strong>bold</strong>, <em>italic</em>, <u>underline</u>, headings and lists</li>
<li>Changes save automatically</li><li>Import a .txt, .md or .docx file from the document list</li></ul>`;

/**
 * Opens (or creates) the SQLite database, applies the schema and seeds demo users.
 * Pass ':memory:' for tests.
 */
export function openDb(filename = process.env.DB_PATH || path.join('data', 'collabdocs.db')) {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(SCHEMA);
  seed(db);
  return db;
}

function seed(db) {
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (email, name) VALUES (?, ?)');
  for (const u of SEED_USERS) insertUser.run(u.email, u.name);

  // One example shared doc so a fresh deployment demonstrates the "Shared with me" view immediately.
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM documents').get();
  if (n === 0) {
    const alice = db.prepare('SELECT id FROM users WHERE email = ?').get(SEED_USERS[0].email);
    const bob = db.prepare('SELECT id FROM users WHERE email = ?').get(SEED_USERS[1].email);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO documents (owner_id, title, content) VALUES (?, ?, ?)')
      .run(alice.id, 'Welcome to Collab Docs', WELCOME_DOC);
    db.prepare('INSERT INTO document_shares (document_id, user_id, role) VALUES (?, ?, ?)').run(
      lastInsertRowid,
      bob.id,
      'editor',
    );
  }
}
