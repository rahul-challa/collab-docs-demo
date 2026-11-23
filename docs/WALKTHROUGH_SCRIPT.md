# Walkthrough video outline (3–5 min)

**1. Intro (20s).** "I'm Rahul. This is Ajaia Docs, a lightweight collaborative editor. I focused on three things: never losing work, server-enforced sharing, and formatting that round-trips faithfully."

**2. Main flow (90s)**, signed in as Alice:
- Click **New document**, rename it, and type with a heading, bold, italic, underline, and bulleted and numbered lists. Point at the save indicator, then refresh to show everything persisted.
- Click **Import file** and choose `samples/quarterly-review.docx`. A new document appears with its formatting intact.
- In the editor, click **Insert file** and choose `samples/project-brief.md`.

**3. Sharing (60s):**
- Click **Share**, add Bob as *Can view*. Mention the unknown-email error.
- In a private window, sign in as Bob. Show **Shared with me**, the *View only* badge, and the read-only editor.
- As Alice, switch Bob to *Can edit*. Bob reloads and can edit.
- Sign in as Carol and open the URL to show "no access" (a 404, so IDs don't leak).
- Conflict demo: with Alice's tab open, Bob saves. Alice types, gets the conflict banner, and clicks "Load latest".

**4. Decisions and cuts (45s).** Cover SQLite through `node:sqlite` (no native builds), HTML sanitized on the server, optimistic versioning instead of CRDTs, mocked auth, and viewer/editor roles as the one stretch item. Then name what I'd build next.

**5. AI workflow (30s).** I used Claude Code for scaffolding, tests and browser E2E. I directed the scope and reviewed the output. Examples of what I changed: swapping Vitest for `node:test`, fixing the remounting toolbar, and pausing editing on conflict after reviewing the E2E screenshot. Verification came from API tests, the E2E run and screenshot review.
