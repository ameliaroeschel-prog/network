/**
 * Authentication middleware.
 *
 * Every request to /api/contacts must carry a token proving who is asking.
 * This file checks that the token is genuine before any route code runs.
 *
 * How the check works, in plain terms:
 *   Neon signs each token with a private key only Neon has. Neon publishes the
 *   matching PUBLIC key at a well-known address (the "JWKS" endpoint). We fetch
 *   that public key and use it to confirm the signature. A forged token fails,
 *   because forging one would require Neon's private key.
 *
 * We never trust anything the client says about who it is -- only what the
 * signature proves.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';

const AUTH_BASE_URL = process.env.NEON_AUTH_BASE_URL;

if (!AUTH_BASE_URL) {
  throw new Error(
    'NEON_AUTH_BASE_URL is not set. Copy .env.example to .env.local and fill it in.',
  );
}

/**
 * The "issuer" recorded inside Neon's tokens is the ORIGIN of the auth URL --
 * scheme and host only, no path. Comparing against the full URL is a common
 * mistake that makes every token look invalid.
 */
const ISSUER = new URL(AUTH_BASE_URL).origin;

/**
 * Fetches and caches Neon's public signing keys.
 * `jose` handles the caching and re-fetches if it sees a key ID it does not
 * recognise, so a key rotation at Neon does not take the API down.
 */
const jwks = createRemoteJWKSet(new URL(`${AUTH_BASE_URL}/.well-known/jwks.json`));

/** Pull the token out of an `Authorization: Bearer <token>` header. */
function readBearerToken(req) {
  const header = req.headers.authorization;
  if (!header) return null;

  const [scheme, token] = header.split(' ');
  if (!/^Bearer$/i.test(scheme) || !token) return null;

  return token.trim();
}

/**
 * Verify a Neon token and return its claims.
 * Exported so tests can exercise it directly.
 */
export async function verifyToken(token) {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: ISSUER,
    // Neon signs with EdDSA (Ed25519). Naming the algorithm explicitly stops
    // an attacker suggesting a weaker one.
    algorithms: ['EdDSA'],
  });
  return payload;
}

/**
 * Express middleware. On success it attaches to the request:
 *   req.user  -> { id, email }
 *   req.token -> the raw token, forwarded on to the Neon Data API so that
 *                Row Level Security sees the right user
 *
 * On failure it responds 401 and the route never runs.
 */
export async function requireAuth(req, res, next) {
  const token = readBearerToken(req);

  if (!token) {
    return res.status(401).json({
      error: 'Not signed in.',
      message: 'This request needs a valid session. Try signing in again.',
    });
  }

  try {
    const claims = await verifyToken(token);

    // `sub` is the user's ID, and it is the value auth.user_id() returns
    // inside Postgres. It is what every Row Level Security policy compares
    // against, so it is the single source of truth for ownership.
    req.user = { id: claims.sub, email: claims.email };
    req.token = token;

    return next();
  } catch (error) {
    // Tokens last 15 minutes. An expired one is normal, not an attack, so it
    // gets a message the UI can act on by fetching a fresh token.
    const expired = error?.code === 'ERR_JWT_EXPIRED';

    return res.status(401).json({
      error: expired ? 'Session expired.' : 'Invalid session.',
      message: expired
        ? 'Your session timed out. Please sign in again.'
        : 'Could not verify your session. Please sign in again.',
    });
  }
}
