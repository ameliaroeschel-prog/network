/**
 * Local development server.
 *
 * Starts the Express app on a port so you can work on it locally.
 * In production this file is never used -- Vercel imports the app through
 * api/index.js instead.
 *
 * Run it with:  npm run dev:api
 */

// Load .env.local first, then .env as a fallback. Vite uses .env.local by
// convention, so the API reads the same file rather than needing its own.
// This must run BEFORE ./app.js is imported, because the modules it pulls in
// read process.env as they load -- hence the dynamic import further down.
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

config({ path: resolve(repoRoot, '.env.local') });
config({ path: resolve(repoRoot, '.env') });

const { createApp } = await import('./app.js');

const port = Number(process.env.PORT) || 3001;

const app = createApp();

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
  console.log(`Health check:    http://localhost:${port}/api/health`);
});
