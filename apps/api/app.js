/**
 * The Express application.
 *
 * This file builds the app but never starts a server. That separation is what
 * lets the same code run in three places:
 *
 *   server.js      starts it on a port for local development
 *   api/index.js   hands it to Vercel as a serverless function
 *   the tests      import it directly, with no network involved
 *
 * The app knows nothing about the React frontend. It speaks plain HTTP and
 * JSON, so a future mobile app can use exactly the same endpoints.
 */

import express from 'express';
import { requireAuth } from './auth.js';
import { authProxyRouter } from './authProxy.js';
import { contactsRouter } from './routes/contacts.js';

export function createApp() {
  const app = express();

  // Vercel sits in front of this app, so trust its forwarded headers.
  app.set('trust proxy', 1);
  // Do not advertise what the server is built with.
  app.disable('x-powered-by');

  // ---- Auth proxy --------------------------------------------------------
  // Mounted BEFORE the JSON parser on purpose: the proxy forwards the raw
  // request bytes to Neon unchanged, so express.raw() hands it a Buffer
  // rather than a parsed object.
  app.use(
    '/api/auth',
    express.raw({ type: () => true, limit: '100kb' }),
    authProxyRouter,
  );

  // Reject oversized bodies before parsing them. Our largest field is 5000
  // characters, so 100kb is generous.
  app.use(express.json({ limit: '100kb' }));

  // ---- Health check ------------------------------------------------------
  // Deliberately public: it reveals nothing and makes deployment easy to test.
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // ---- Contacts ----------------------------------------------------------
  // requireAuth runs first, so no route below ever sees an unverified request.
  app.use('/api/contacts', requireAuth, contactsRouter);

  // ---- Unknown API routes ------------------------------------------------
  app.use('/api', (req, res) => {
    res.status(404).json({
      error: 'Not found.',
      message: `No API route matches ${req.method} ${req.originalUrl}.`,
    });
  });

  // ---- Errors ------------------------------------------------------------
  // Four arguments is how Express recognises an error handler.
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    // Malformed JSON in the request body.
    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({
        error: 'Could not read that request.',
        message: 'The request body was not valid JSON.',
      });
    }

    if (error?.type === 'entity.too.large') {
      return res.status(413).json({
        error: 'Too much data.',
        message: 'That contact is too large. Try shortening the notes.',
      });
    }

    // Log the real error for us, return a generic message to the client.
    // Internal details -- URLs, stack traces, database hints -- must never
    // reach the browser.
    console.error('[api] unhandled error:', error);

    res.status(500).json({
      error: 'Something went wrong.',
      message: 'Something went wrong on our end. Please try again.',
    });
  });

  return app;
}

export default createApp;
