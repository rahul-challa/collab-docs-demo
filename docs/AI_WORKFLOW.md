# AI Workflow Note

**Author:** Rahul

## Tools used

- **Claude Code (Claude Opus 5.5)** in VS Code, as an agentic pair programmer. It scaffolded the project, wrote most of the implementation and tests, ran the test suites, and drove a headless Chrome to verify the UI.
- No other AI tools.

I set the direction and owned the decisions: what to build, what to cut, the data model, the access rules, and the "never silently lose work" priority. Claude Code did most of the typing. My role was to steer it, review what it produced, and decide what to accept.

## Where AI materially sped things up

- **Scaffolding and wiring.** Express routes, the SQLite schema, the React pages and the CSS were done in minutes rather than hours. That freed time for the parts that matter (save pipeline, access checks, conflict handling).
- **Library APIs.** TipTap 3 changed a few things from v2. For example, StarterKit now bundles Underline and Link, and toolbars need `useEditorState` to re-render. Getting this right on the first pass saved documentation digging.
- **Test breadth.** Writing the full owner/editor/viewer/no-access role matrix as API tests, plus a 10-step browser E2E, is tedious by hand and fast with AI.
- **Sample fixtures.** A real `.docx` was generated programmatically for testing the import.

## What was changed or rejected

- **Vitest → `node:test`.** The first test setup used Vitest 4, which crashed npm 10's dependency resolver. Rather than fight it, I switched to Node's built-in test runner. That means one fewer dependency, and the API tests need nothing beyond `supertest`.
- **Toolbar component defined inside render.** The generated toolbar declared its `Btn` component inside the parent function, which remounts every button on every render. It was moved to module scope.
- **Share dialog re-fetching on every render.** An effect depended on an inline `onClose` callback, so it refetched the user list on each render. Fixed.
- **Conflict state left the editor editable.** On reviewing the E2E screenshot of the 409 conflict state, the banner said "not saved" but the user could keep typing into a document that could never be saved. I changed it to pause editing and hide the toolbar until the user loads the latest version, and added an E2E assertion for it.
- **Rejected:** real-time collaboration (Yjs/WebSockets) and password/JWT auth. Both were technically within reach, but they would have spent the timebox on surface area instead of on reliability. See [ARCHITECTURE.md](ARCHITECTURE.md).
- **Rejected:** trusting client HTML. All stored content is sanitized on the server against the editor's own tag allowlist, and a test sends `<script>`, `onclick` and `javascript:` URLs to prove they are stripped.

## How correctness, UX and reliability were verified

- **API tests (`npm test`, 6 tests, all passing).** These cover auth, create/rename/edit/reopen with formatting preserved, the full sharing and role matrix including revoke, 409 on stale saves, validation, sanitization, and import of `.md`, `.txt`, unsupported and corrupt files.
- **Browser E2E (`npm run test:e2e`, all 10 steps passing).** This drives real Chrome as three users: format and reload, share as viewer, a validation error for an unknown email, `.docx` import, `.md` insert, Bob's read-only view, Carol's no-access, upgrading Bob to editor, and a two-tab conflict and recovery. Unexpected browser console errors fail the run.
- **Screenshot review.** The E2E saves screenshots of each key screen (in `docs/screenshots/`). Reviewing them is how the conflict-state UX problem above was caught.
- **Production build check.** The exact build command Render runs (`npm ci && npm run build`) was run from a clean client install, and the built app was served by the production server for the E2E run.
- **Not verified here:** the Docker image build, because the Docker daemon wasn't running on my machine. The Dockerfile is straightforward, but it is untested.
