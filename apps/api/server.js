/**
 * Local development server.
 *
 * Starts the Express app on a port so you can work on it locally.
 * In production this file is never used -- Vercel imports the app through
 * api/index.js instead.
 *
 * Run it with:  npm run dev:api
 */

import 'dotenv/config';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3001;

const app = createApp();

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
  console.log(`Health check:    http://localhost:${port}/api/health`);
});
