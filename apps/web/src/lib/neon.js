/**
 * Sign up, sign in, sign out, and reading the current session.
 *
 * Every call here goes to /api/auth on OUR OWN domain, which Express forwards
 * to Neon Managed Better Auth (see apps/api/authProxy.js).
 *
 * WHY NOT CALL NEON DIRECTLY FROM THE BROWSER?
 * --------------------------------------------
 * Neon Auth is on a different domain to this app. A session cookie set by one
 * domain and read by another is a "third-party cookie", which Safari blocks by
 * default and Chrome is phasing out. Sign-in worked in some browsers and
 * silently failed in others.
 *
 * Going through our own domain makes the session cookie first-party, so every
 * browser keeps it. It also means the browser never needs the Neon Auth URL.
 *
 * Because these are same-origin requests, the cookie is sent automatically --
 * `credentials: 'same-origin'` is the browser default. No configuration to get
 * wrong, which is exactly what went wrong the first time round.
 */

const AUTH = '/api/auth';

/** Call the auth proxy and return { status, body }. */
async function authFetch(path, options = {}) {
  const response = await fetch(`${AUTH}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  const text = await response.text();

  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  return { status: response.status, ok: response.ok, body };
}

/**
 * Fetch a fresh access token (a JWT) for the signed-in user.
 *
 * These expire after about 15 minutes, so we ask for a new one before each API
 * call rather than holding on to one.
 *
 * @returns {Promise<string|null>} null when nobody is signed in.
 */
export async function getAccessToken() {
  try {
    const { ok, body } = await authFetch('/token');
    if (!ok) return null;
    return body?.token ?? null;
  } catch {
    return null;
  }
}

/**
 * The currently signed-in user, or null.
 *
 * Note Neon answers 200 with a body of `null` when there is no session -- not
 * an error. Treating that as "signed out" rather than "something broke" is
 * what makes a refresh behave correctly.
 */
export async function getCurrentUser() {
  try {
    const { ok, body } = await authFetch('/get-session');
    if (!ok || !body?.session) return null;
    return body.user ?? null;
  } catch {
    return null;
  }
}

/** Create an account. Returns { user } or { error } with a readable message. */
export async function signUp({ name, email, password }) {
  try {
    const { ok, body } = await authFetch('/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });

    if (!ok) return { error: readableAuthError(body) };
    return { user: body?.user ?? null };
  } catch {
    return { error: 'Could not reach the server. Check your connection and try again.' };
  }
}

/** Sign in. Returns { user } or { error } with a readable message. */
export async function signIn({ email, password }) {
  try {
    const { ok, body } = await authFetch('/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (!ok) return { error: readableAuthError(body) };
    return { user: body?.user ?? null };
  } catch {
    return { error: 'Could not reach the server. Check your connection and try again.' };
  }
}

/** Sign out, clearing the session cookie. */
export async function signOut() {
  try {
    await authFetch('/sign-out', { method: 'POST', body: '{}' });
    return {};
  } catch {
    return { error: 'Could not sign you out. Please try again.' };
  }
}

/**
 * Turn an auth error into something worth showing a person.
 *
 * Deliberately vague about whether an email exists -- "those details did not
 * match" rather than "no account with that email" -- so the sign-in form
 * cannot be used to discover who has an account.
 */
function readableAuthError(body) {
  const message = String(body?.message ?? body?.error ?? '').toLowerCase();
  const code = String(body?.code ?? '').toUpperCase();

  if (code.includes('USER_ALREADY_EXISTS') || message.includes('already')) {
    return 'An account with that email already exists. Try signing in instead.';
  }
  if (code.includes('INVALID') || message.includes('invalid') || message.includes('credential')) {
    return 'Those details did not match an account. Check your email and password.';
  }
  if (message.includes('password')) {
    return 'That password is too short. Use at least 8 characters.';
  }
  if (message.includes('email')) {
    return 'That does not look like a valid email address.';
  }

  return 'Something went wrong signing you in. Please try again.';
}
