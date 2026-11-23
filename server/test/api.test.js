import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { openDb } from '../db.js';
import { createApp } from '../app.js';

let app;

beforeEach(() => {
  app = createApp(openDb(':memory:'));
});

async function login(email) {
  const res = await request(app).post('/api/auth/login').send({ email }).expect(200);
  return { Authorization: `Bearer ${res.body.token}` };
}

async function createDoc(auth, body = {}) {
  const res = await request(app).post('/api/documents').set(auth).send(body).expect(201);
  return res.body;
}

test('rejects unauthenticated requests and unknown accounts', async () => {
  await request(app).get('/api/documents').expect(401);
  await request(app).post('/api/auth/login').send({ email: 'mallory@evil.test' }).expect(401);
});

test('create, rename, edit and reopen a document with formatting preserved', async () => {
  const alice = await login('alice@collabdocs.test');
  const doc = await createDoc(alice);
  assert.equal(doc.title, 'Untitled document');
  assert.equal(doc.role, 'owner');

  const html = '<h2>Plan</h2><p><strong>bold</strong> <em>it</em> <u>u</u></p><ol><li>one</li></ol>';
  const saved = await request(app)
    .patch(`/api/documents/${doc.id}`)
    .set(alice)
    .send({ title: 'Q3 Plan', content: html, version: doc.version })
    .expect(200);
  assert.equal(saved.body.version, doc.version + 1);

  const reopened = await request(app).get(`/api/documents/${doc.id}`).set(alice).expect(200);
  assert.equal(reopened.body.title, 'Q3 Plan');
  assert.equal(reopened.body.content, html);
});

test('sharing: owner grants access, recipient sees it under shared, roles are enforced', async () => {
  const alice = await login('alice@collabdocs.test');
  const bob = await login('bob@collabdocs.test');
  const carol = await login('carol@collabdocs.test');
  const doc = await createDoc(alice, { title: 'Roadmap' });

  // Before sharing, Bob cannot see it at all (404, not 403, so IDs don't leak).
  await request(app).get(`/api/documents/${doc.id}`).set(bob).expect(404);

  await request(app)
    .put(`/api/documents/${doc.id}/shares`)
    .set(alice)
    .send({ email: 'bob@collabdocs.test', role: 'viewer' })
    .expect(200);

  const bobList = await request(app).get('/api/documents').set(bob).expect(200);
  const sharedEntry = bobList.body.shared.find((d) => d.id === doc.id);
  assert.ok(sharedEntry, 'doc appears in Bob\'s shared list');
  assert.equal(sharedEntry.role, 'viewer');
  assert.ok(!bobList.body.owned.some((d) => d.id === doc.id), 'not listed as owned by Bob');

  // Viewer can read but not write, and cannot reshare.
  await request(app).get(`/api/documents/${doc.id}`).set(bob).expect(200);
  await request(app)
    .patch(`/api/documents/${doc.id}`)
    .set(bob)
    .send({ content: '<p>hi</p>', version: doc.version })
    .expect(403);
  await request(app)
    .put(`/api/documents/${doc.id}/shares`)
    .set(bob)
    .send({ email: 'carol@collabdocs.test' })
    .expect(403);

  // Upgrade to editor: Bob can now save, but still cannot delete.
  await request(app)
    .put(`/api/documents/${doc.id}/shares`)
    .set(alice)
    .send({ email: 'bob@collabdocs.test', role: 'editor' })
    .expect(200);
  await request(app)
    .patch(`/api/documents/${doc.id}`)
    .set(bob)
    .send({ content: '<p>Bob was here</p>', version: doc.version })
    .expect(200);
  await request(app).delete(`/api/documents/${doc.id}`).set(bob).expect(403);

  // Carol was never granted access.
  await request(app).get(`/api/documents/${doc.id}`).set(carol).expect(404);

  // Revoking removes access.
  const me = await request(app).get('/api/me').set(bob).expect(200);
  await request(app).delete(`/api/documents/${doc.id}/shares/${me.body.id}`).set(alice).expect(200);
  await request(app).get(`/api/documents/${doc.id}`).set(bob).expect(404);
});

test('stale saves are rejected with 409 instead of overwriting newer edits', async () => {
  const alice = await login('alice@collabdocs.test');
  const doc = await createDoc(alice);
  await request(app)
    .patch(`/api/documents/${doc.id}`)
    .set(alice)
    .send({ content: '<p>first</p>', version: doc.version })
    .expect(200);
  const stale = await request(app)
    .patch(`/api/documents/${doc.id}`)
    .set(alice)
    .send({ content: '<p>stale</p>', version: doc.version })
    .expect(409);
  assert.equal(stale.body.document.content, '<p>first</p>');
});

test('validation and sanitisation', async () => {
  const alice = await login('alice@collabdocs.test');
  await request(app).post('/api/documents').set(alice).send({ title: '   ' }).expect(400);
  await request(app).post('/api/documents').set(alice).send({ title: 'x'.repeat(201) }).expect(400);

  const doc = await createDoc(alice, {
    content: '<p onclick="x()">safe</p><script>alert(1)</script><a href="javascript:alert(1)">l</a>',
  });
  assert.equal(doc.content, '<p>safe</p><a>l</a>');
});

test('file import: .md and .txt become documents, unsupported types are rejected', async () => {
  const alice = await login('alice@collabdocs.test');

  const md = await request(app)
    .post('/api/documents/import')
    .set(alice)
    .attach('file', Buffer.from('# Notes\n\n- **one**\n- two\n'), 'meeting-notes.md')
    .expect(201);
  assert.equal(md.body.title, 'meeting-notes');
  assert.match(md.body.content, /<h1>Notes<\/h1>/);
  assert.match(md.body.content, /<li><strong>one<\/strong><\/li>/);

  const txt = await request(app)
    .post('/api/documents/import')
    .set(alice)
    .attach('file', Buffer.from('Line <1>\nline 2\n\nPara 2'), 'todo.txt')
    .expect(201);
  assert.equal(txt.body.content, '<p>Line &lt;1&gt;<br />line 2</p><p>Para 2</p>');

  await request(app)
    .post('/api/documents/import')
    .set(alice)
    .attach('file', Buffer.from('%PDF'), 'scan.pdf')
    .expect(400);
  await request(app)
    .post('/api/documents/import')
    .set(alice)
    .attach('file', Buffer.from('not a zip'), 'broken.docx')
    .expect(400);
});
