/**
 * Same-origin auth proxy.
 *
 * WHY THIS EXISTS
 * ---------------
 * Neon Auth lives on a different domain to this app (…neon.tech vs …vercel.app).
 * A session cookie set by one domain and read by another is a "third-party
 * cookie". Safari blocks those by default, and Chrome is phasing them out, so
 * signing in worked for some people and silently failed for others.
 *
 * This router makes the browser talk only to OUR domain. The browser calls
 * /api/auth/... , Express forwards the call to Neon, and the session cookie
 * comes back rewritten for our own domain. It is now a first-party cookie, so
 * every browser keeps it.
 *
 * The browser never learns the Neon Auth URL, which is a small bonus: one less
 * piece of infrastructure exposed to the client.
 */

import { Router } from 'express';

const AUTH_BASE_URL = process.env.NEON_AUTH_BASE_URL;

if (!AUTH_BASE_URL) {
  throw new Error(
    'NEON_AUTH_BASE_URL is not set. Copy .env.example to .env.local and fill it in.',
  );
}

const BASE = AUTH_BASE_URL.replace(/\/+$/, '');

/** Request headers worth passing on to Neon. Everything else is dropped. */
const FORWARD_TO_NEON = ['content-type', 'accept', 'accept-language', 'cookie', 'authorization'];

/** Response headers worth passing back to the browser. */
const FORWARD_TO_BROWSER = ['content-type', 'cache-control', 'set-auth-jwt'];

/**
 * Rewrite a Set-Cookie header so the browser stores it for OUR domain.
 *
 * Neon sends its session cookie like this:
 *
 *   __Secure-neon-auth.session_token=...; Path=/; HttpOnly; Secure;
 *   SameSite=None; Partitioned
 *
 * Three details matter, and getting any of them wrong makes the browser
 * silently throw the cookie away:
 *
 *   Domain      Neon does not set one, so the cookie is already host-only.
 *               Stripped anyway in case that changes.
 *
 *   Secure      MUST be kept. The `__Secure-` name prefix is only valid on a
 *               cookie that carries Secure, so removing it invalidates the
 *               cookie entirely. Browsers treat http://localhost as a secure
 *               context, so keeping Secure works in development too.
 *
 *   SameSite    None -> Lax. The cookie is first-party now, so it no longer
 *               needs the cross-site setting.
 *
 *   Partitioned Removed. It is for cross-site cookies (CHIPS) and is invalid
 *               alongside SameSite=Lax -- leaving it in gets the whole cookie
 *               rejected.
 */
function rewriteCookie(cookie) {
  const parts = cookie.split(';').map((part) => part.trim()).filter(Boolean);

  const kept = parts.filter((part) => {
    const name = part.split('=')[0].toLowerCase();
    if (name === 'domain') return false;
    if (name === 'samesite') return false;
    if (name === 'partitioned') return false;
    if (name === 'secure') return false; // re-added below, always
    return true;
  });

  kept.push('SameSite=Lax', 'Secure');

  return kept.join('; ');
}

export const authProxyRouter = Router();

authProxyRouter.use(async (req, res) => {
  // req.url is the part after /api/auth, e.g. "/sign-in/email".
  const target = `${BASE}${req.url}`;

  const headers = {};
  for (const name of FORWARD_TO_NEON) {
    const value = req.get(name);
    if (value) headers[name] = value;
  }

  // Neon only issues a session cookie when the request carries an Origin
  // header, and browsers omit Origin on same-origin GETs -- which is most of
  // our traffic now that the proxy makes everything same-origin. So we always
  // send one, falling back to this app's own address.
  //
  // Neon checks it against its trusted domains: every localhost port is
  // pre-approved, and the deployed domain is registered in the Neon Console.
  const isSecure = req.secure || req.get('x-forwarded-proto') === 'https';
  const selfOrigin = `${isSecure ? 'https' : 'http'}://${req.get('host')}`;
  headers.origin = req.get('origin') || selfOrigin;

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      // req.body is a Buffer here because this router is mounted before the
      // JSON parser -- see app.js. Forwarding the raw bytes avoids changing
      // the payload in any way.
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
      redirect: 'manual',
    });

    // Cookies: rewrite each one for our own domain.
    const setCookie =
      typeof upstream.headers.getSetCookie === 'function'
        ? upstream.headers.getSetCookie()
        : [upstream.headers.get('set-cookie')].filter(Boolean);

    if (setCookie.length > 0) {
      res.setHeader('Set-Cookie', setCookie.map(rewriteCookie));
    }

    for (const name of FORWARD_TO_BROWSER) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    // Neon sends a Location header on some flows (e.g. OAuth). Keep it
    // relative to us rather than leaking the upstream host.
    const location = upstream.headers.get('location');
    if (location) res.setHeader('Location', location);

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status).send(buffer);
  } catch (error) {
    console.error('[auth-proxy] could not reach Neon Auth:', error);
    res.status(502).json({
      error: 'Authentication service unavailable.',
      message: 'Could not reach the sign-in service. Please try again in a moment.',
    });
  }
});
