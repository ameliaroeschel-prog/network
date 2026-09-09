/**
 * Vercel serverless entry point.
 *
 * Vercel treats every file in this top-level /api folder as a serverless
 * function. An Express app is already a function of (request, response), so
 * handing it over directly is all that is needed.
 *
 * The API itself does not know it is running serverless -- the same app.js
 * runs locally under server.js and inside the test suite.
 */

import { createApp } from '../apps/api/app.js';

export default createApp();
