# Architecture Note

**Author and decision owner:** Rahul

## What I prioritized and why

The brief rewards depth in a few areas over shallow coverage, so I went deep on the parts that make a document tool trustworthy:

1. **Your work is never silently lost.** Autosave is debounced and serialized, with one request in flight at a time; edits made during a save are batched into the next one. A save status is always visible. Failed saves keep the pending changes and offer a retry. The browser warns before you close a tab with unsaved changes. Two people editing the same doc can't overwrite each other: each save carries the version it was based on, and the server rejects stale saves with **409**.
2. **Access control is enforced on the server, not just hidden in the UI.** A single `loadDoc(docId, user, minRole)` check gates every document route, so every route enforces the role rules the same way. Users without access get **404 rather than 403**, so document IDs don't reveal what exists.
3. **Formatting round-trips faithfully.** I store content as HTML, restricted to exactly the tags the editor can produce. Sanitization happens on the server, so imported files or hand-crafted API calls can't store scripts.

Everything else was kept deliberately simple.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Editor | **TipTap 3** (ProseMirror) | A mature rich-text model. StarterKit covers every required format, plus undo/redo and keyboard shortcuts, without hand-rolling `contenteditable`. |
| Frontend | React 19 + Vite, plain JS + CSS | Fast to build and no design-system dependency. |
| Backend | Express 5 | Small surface area. Async errors propagate to one error handler. |
| Database | SQLite via Node's built-in **`node:sqlite`** | Real relational constraints (foreign keys, `CHECK (role IN …)`, composite primary key on shares) with zero native builds and zero external services. Reviewers just need Node. |
| Import | `mammoth` (.docx), `marked` (.md), and a small escaping text converter (.txt) | Each output goes through the same sanitizer. |
| Deploy | One Node process serves both the API and the built SPA | One URL, no CORS, and one free-tier service. |

## Data model

```
users(id, email UNIQUE, name)
sessions(token PK, user_id → users)
documents(id, owner_id → users, title, content HTML, version, created_at, updated_at)
document_shares(document_id → documents, user_id → users, role ∈ {viewer, editor}, PK(document_id, user_id))
```

Ownership is a column, not a share row, so a document always has exactly one owner and the owner can't be "unshared". Deleting a document cascades to its shares.

## Access rules

| Action | Owner | Editor | Viewer | No access |
|---|---|---|---|---|
| Open / read | ✓ | ✓ | ✓ | 404 |
| Edit content, rename | ✓ | ✓ | 403 | 404 |
| Share, change role, revoke, delete | ✓ | 403 | 403 | 404 |

## Upload design

I implemented two product-relevant behaviours on top of one conversion function:

- **Import file → new document.** The title comes from the filename.
- **Insert file → into the open draft at the cursor.** `/api/convert` only converts and returns HTML. The content is then saved through the normal save path, so the editor-role check still applies.

Supported types are `.txt`, `.md` and `.docx`, up to 5 MB. Uploads are held in memory and never written to disk. Unsupported or corrupt files return a 400 with a clear message.

## Deliberate scope cuts

| Cut | Reasoning |
|---|---|
| **Real-time co-editing** (CRDT/OT, presence) | The biggest single cost in a Docs clone, and it would have eaten the timebox. Optimistic versioning covers the important part, not losing work, at a fraction of the complexity. |
| **Real authentication** | The brief allows mocked auth. Seeded accounts with a one-click login keep reviewer friction near zero. Sessions are still real random bearer tokens stored server-side, so swapping in password or OAuth login only changes `/auth/login`. |
| **Sharing with people who don't have an account** | Sharing resolves to existing users only. Invites would need email delivery. |
| **Attachments, images, tables, comments, version history** | Not required, and each adds storage or UI surface without strengthening the core flow. |
| **Durable hosting** | The free Render tier has an ephemeral disk. The Docker image and `DB_PATH` support a mounted volume when durability matters. |

The one stretch item I took is **role-based sharing (viewer vs editor)**. It was cheap because the role check was already centralized, and it makes the sharing model meaningfully more realistic.

## Known limitations

- When a save conflicts, "Load latest version" discards the unsaved local edits. Editing is paused, so nothing more is lost, but there is no merge.
- The client bundle is about 680 KB (215 KB gzipped), mostly ProseMirror. No code-splitting yet.
- No rate limiting, CSRF or session expiry. That is acceptable with bearer tokens in `localStorage` for a demo, and listed under next steps below.

## What I'd build next (2–4 hours)

1. **Conflict recovery without loss.** Keep the user's local copy alongside the latest version and offer "copy my changes" (about 1 hour).
2. **Presence indicator.** Show who else has the doc open, using a polling heartbeat (about 1 hour).
3. **Version history.** Snapshot on each save into `document_versions`, with a restore button. The `version` column already exists (about 1–2 hours).
4. **Hardening.** Session expiry, rate limiting on login and upload, and code-splitting the editor bundle.
