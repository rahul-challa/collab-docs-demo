import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = openDb(process.env.DB_PATH || path.join(root, 'data', 'collabdocs.db'));
const app = createApp(db, { clientDist: path.join(root, 'client', 'dist') });

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => console.log(`Collab Docs listening on http://localhost:${port}`));
