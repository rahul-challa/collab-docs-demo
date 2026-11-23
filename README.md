# Collab Docs

A lightweight collaborative document editor: create, format, import, share and reopen documents, with owner/editor/viewer access.

**Author:** Rahul. Product scope, architecture and trade-off decisions are mine and are documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). How I used AI is in [docs/AI_WORKFLOW.md](docs/AI_WORKFLOW.md).

- **Live app:** see [SUBMISSION.md](SUBMISSION.md)
- **Demo accounts (no password):** `alice@collabdocs.test`, `bob@collabdocs.test`, `carol@collabdocs.test`

## What works

| Area | Supported |
|---|---|
| Documents | Create, rename (click the title), edit, delete (owner only), reopen. Autosaves about 0.8s after you stop typing; <kbd>Ctrl/Cmd+S</kbd> saves immediately. A save indicator shows saved, saving, unsaved or failed (with retry). |
| Formatting | Bold, italic, underline, strikethrough, Heading 1–3, bulleted and numbered lists, block quote, undo/redo. Keyboard shortcuts work too. |
| File upload | **Supported types: `.txt`, `.md`, `.docx` (max 5 MB).** **Import file** on the document list creates a new document. **Insert file** in the editor toolbar inserts the file's content at the cursor. Other types are rejected with a clear message. |
| Sharing | The owner shares by email as **Can edit** or **Can view**, changes roles, and revokes access. The list separates **My documents** from **Shared with me** (with role badges and the owner's name). Viewers get a read-only editor. Users without access get "not found". |
| Persistence | SQLite. Documents are stored as sanitized HTML, so formatting survives a refresh. Sharing data lives in a `document_shares` table. |
| Concurrency | Optimistic versioning. If someone else saved first, your save is rejected (409) rather than overwriting theirs, and the UI offers "Load latest version". |

## Run locally

Requires **Node.js 22.13+**, which provides the built-in `node:sqlite` module. No native builds and no external services.

```bash
npm install
npm run build        # installs client deps and builds the React app into client/dist
npm start            # http://localhost:3001 (API + built client)
```

Development with hot reload (two terminals):

```bash
npm run dev          # API on :3001 (restarts on change)
npm run dev:client   # Vite on http://localhost:5173, proxies /api to :3001
```

Data is stored in `data/collabdocs.db`, which is created and seeded on first start. Delete that file to reset. Set `DB_PATH` or `PORT` to override.

### Try the sharing flow

1. Sign in as **Alice**. Create a document, add some formatting, then click **Share** and add `bob@collabdocs.test` as *Can view*.
2. Open a private window (or another browser) and sign in as **Bob**. The doc appears under **Shared with me** with a *View only* badge, and the editor is read-only.
3. As Alice, change Bob to *Can edit*. Bob reloads and can now edit.
4. Sign in as **Carol**. Opening the same URL shows "does not exist or you do not have access".

A fresh database also includes a "Welcome to Collab Docs" document that Alice has already shared with Bob as an editor.

Sample import files are in [samples/](samples/): `.md`, `.txt` and `.docx`.

## Tests

```bash
npm test             # API tests (node:test + supertest, in-memory SQLite)
```

These cover auth, create/rename/edit/reopen with formatting preserved, the full sharing and role matrix (owner/editor/viewer/no access, revoke), stale-save conflict (409), validation and HTML sanitization, and `.md`/`.txt`/bad-file import.

```bash
npm start            # in one terminal, against a fresh DB (e.g. DB_PATH=/tmp/e2e.db)
npm run test:e2e     # in another: drives your installed Chrome through the whole flow
```

The browser smoke test logs in as Alice, Bob and Carol. It formats a document and checks that the formatting survives a reload. It shares as viewer, imports a `.docx`, inserts a `.md`, checks read-only and no-access behaviour, upgrades Bob to editor, and triggers and recovers from an edit conflict. It also regenerates the screenshots in `docs/screenshots/`.

## Deploy

The app is one Node process with one SQLite file, so any Node host works.

- **Render (free):** push the repo to GitHub, then in Render choose **New → Blueprint** and select the repo. [render.yaml](render.yaml) configures it (`npm ci && npm run build`, then `npm start`, with a health check on `/api/health`). The free tier's disk is ephemeral, so data resets on each redeploy or restart and is re-seeded. That is fine for a demo, and the limitation is documented.
- **Docker:** `docker build -t collab-docs-demo . && docker run -p 3001:3001 -v collabdocs-data:/data collab-docs-demo` (data persists in the volume).

## Project layout

```
server/            Express API
  app.js           routes, access control, validation, error handling
  db.js            schema + seed data (node:sqlite)
  content.js       HTML sanitization, .txt/.md/.docx → HTML conversion
  test/            API tests
client/src/        React + TipTap SPA
  pages/           Login, DocList, EditorPage (autosave + conflict handling)
  components/      Toolbar, ShareDialog
e2e/smoke.cjs      browser end-to-end smoke test
samples/           example files for the upload feature
docs/              architecture note, AI workflow note, screenshots
```
