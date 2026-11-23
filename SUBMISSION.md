# Submission: Collab Docs

**Candidate:** Rahul

## Links

- **Live app:** https://collab-docs-demo.onrender.com
- **Walkthrough video:** see [VIDEO_URL.txt](VIDEO_URL.txt)

## Test accounts (no password, pick one on the sign-in screen)

| Account | Use it for |
|---|---|
| `alice@collabdocs.test` | Owner. Already owns "Welcome to Collab Docs", shared with Bob. |
| `bob@collabdocs.test` | Collaborator. Sees Alice's welcome doc under **Shared with me**. |
| `carol@collabdocs.test` | Outsider. Confirms that unshared docs are not accessible. |

Use a private window or a second browser to be signed in as two users at once. The hosted demo runs on Render's free tier: the first request after it has been idle can take about 30 seconds, and data resets when the service restarts.

## What's included

| Path | Contents |
|---|---|
| `server/` | Express API, SQLite schema and seed data, sanitization and file conversion |
| `server/test/api.test.js` | Automated API tests (`npm test`) |
| `client/` | React + TipTap frontend |
| `e2e/smoke.cjs` | Browser end-to-end test (`npm run test:e2e`) |
| `samples/` | `.md`, `.txt` and `.docx` files for trying the upload feature |
| `README.md` | Local setup, run, test and deploy instructions |
| `docs/ARCHITECTURE.md` | Architecture note: priorities, decisions, scope cuts, next steps |
| `docs/AI_WORKFLOW.md` | AI workflow note |
| `docs/screenshots/` | Screenshots of every key screen |
| `docs/WALKTHROUGH_SCRIPT.md` | Outline used for the walkthrough video |
| `VIDEO_URL.txt` | Walkthrough video link |
| `Dockerfile`, `render.yaml` | Deployment config |
| `SUBMISSION.md` | This file |

## Status

**Working end to end:**
- Creating, renaming, editing, autosaving, reopening and deleting documents.
- Bold, italic, underline, strikethrough, headings H1–H3, bulleted and numbered lists, and quotes.
- File upload for `.txt`, `.md` and `.docx`: import as a new document, or insert into the open document.
- Sharing with owner, editor and viewer roles. Roles can be changed and access revoked. The document list separates owned and shared documents.
- SQLite persistence.
- Conflict-safe saves.
- Validation and error states.
- API tests and a browser E2E test.

**Partial or intentionally excluded:**
- No real-time co-editing or presence. Concurrent edits are detected (409) rather than merged.
- Auth is mocked with seeded accounts, by design.
- Hosted data is not durable on the free tier.

**Next 2–4 hours:** non-lossy conflict recovery, a presence indicator, version history, then session expiry and rate limiting. Details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#what-id-build-next-24-hours).
