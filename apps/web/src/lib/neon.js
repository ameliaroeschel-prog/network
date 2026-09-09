/**
 * The Neon client — sign up, sign in, sign out, and reading the current token.
 *
 * This is the ONLY part of the frontend that talks to Neon directly. Contact
 * data never comes from here; it goes through our own Express API instead.
 * This client's job is purely to establish who you are and hand us a token.
 */

import { createClient } from '@neondatabase/neon-js';

const authUrl = import.meta.env.VITE_NEON_AUTH_URL;
const dataApiUrl = import.meta.env.VITE_NEON_DATA_API_URL;

if (!authUrl || !dataApiUrl) {
  throw new Error(
    'Missing VITE_NEON_AUTH_URL or VITE_NEON_DATA_API_URL. ' +
      'Copy .env.example to .env.local and fill in the values from your Neon Console.',
  );
}

/**
 * The two-URL object form. Auth and data live on different hostnames, so both
 * are given explicitly rather than derived from one base URL.
 */
export const neon = createClient({
  auth: {
    url: authUrl,
    // The browser is on localhost (or your Vercel domain) while Neon Auth is
    // on neon.tech, which makes these cross-origin requests. Without this the
    // session cookie is not sent and token() silently returns nothing.
    fetchOptions: { credentials: 'include' },
  },
  dataApi: { url: dataApiUrl },
});

/**
 * Fetch a fresh access token for the signed-in user.
 *
 * Tokens last about 15 minutes, so we ask for one before each API call rather
 * than holding on to it. The SDK caches and refreshes underneath, so this is
 * cheap.
 *
 * @returns {Promise<string|null>} null when nobody is signed in.
 */
export async function getAccessToken() {
  try {
    const { data, error } = await neon.auth.token();
    if (error) return null;
    return data?.token ?? null;
  } catch {
    return null;
  }
}

/** The currently signed-in user, or null. */
export async function getCurrentUser() {
  try {
    const { data, error } = await neon.auth.getSession();
    if (error || !data?.session) return null;
    return data.user ?? null;
  } catch {
    return null;
  }
}

/** Create an account. Returns { user } or { error } with a readable message. */
export async function signUp({ name, email, password }) {
  const { data, error } = await neon.auth.signUp.email({ name, email, password });

  if (error) return { error: readableAuthError(error) };
  return { user: data?.user ?? null };
}

/** Sign in. Returns { user } or { error } with a readable message. */
export async function signIn({ email, password }) {
  const { data, error } = await neon.auth.signIn.email({ email, password });

  if (error) return { error: readableAuthError(error) };
  return { user: data?.user ?? null };
}

/** Sign out, clearing the session in this tab and any others. */
export async function signOut() {
  const { error } = await neon.auth.signOut();
  if (error) return { error: readableAuthError(error) };
  return {};
}

/**
 * Turn an auth error into something worth showing a person.
 *
 * Deliberately vague about whether an email exists: "those details did not
 * match" rather than "no account with that email", so the sign-in form cannot
 * be used to discover who has an account.
 */
function readableAuthError(error) {
  const message = String(error?.message ?? '').toLowerCase();

  if (message.includes('invalid') || message.includes('credential')) {
    return 'Those details did not match an account. Check your email and password.';
  }
  if (message.includes('already') || message.includes('exists')) {
    return 'An account with that email already exists. Try signing in instead.';
  }
  if (message.includes('password')) {
    return 'That password is too short. Use at least 8 characters.';
  }
  if (message.includes('email')) {
    return 'That does not look like a valid email address.';
  }
  if (message.includes('fetch') || message.includes('network')) {
    return 'Could not reach the server. Check your connection and try again.';
  }

  return 'Something went wrong signing you in. Please try again.';
}
