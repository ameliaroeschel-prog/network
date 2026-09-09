/**
 * Two-account privacy test.
 *
 * Proves that User A cannot read, change, or delete User B's contacts —
 * and proves it at the DATABASE level, not just through our API.
 *
 * The script:
 *   1. signs in as two separate accounts
 *   2. has User A file a contact
 *   3. has User B try to reach it, six different ways
 *
 * Three of those attempts go through our Express API. The other three skip the
 * API entirely and hit the Neon Data API directly with User B's own token. That
 * second set is the important one: it shows the protection lives in Postgres,
 * so it holds even for someone who never touches our code.
 *
 * Usage:
 *   node scripts/verify-rls.js
 *
 * Reads from .env.local:
 *   NEON_AUTH_BASE_URL, NEON_DATA_API_URL
 *   TEST_USER_A_EMAIL, TEST_USER_A_PASSWORD
 *   TEST_USER_B_EMAIL, TEST_USER_B_PASSWORD
 *   API_BASE_URL  (optional, defaults to http://localhost:3001)
 */

import 'dotenv/config';

const AUTH_URL = required('NEON_AUTH_BASE_URL').replace(/\/+$/, '');
const DATA_API_URL = required('NEON_DATA_API_URL').replace(/\/+$/, '');
const API_BASE_URL = (process.env.API_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '');

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Fill in .env.local first.`);
    process.exit(1);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Signing in
// ---------------------------------------------------------------------------

/**
 * Sign in and return an access token.
 *
 * The session itself is an HTTP-only cookie, so we capture it from the sign-in
 * response and send it back when asking for a token.
 */
async function signIn(email, password) {
  const signInResponse = await fetch(`${AUTH_URL}/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!signInResponse.ok) {
    const detail = await signInResponse.text();
    throw new Error(
      `Sign-in failed for ${email} (${signInResponse.status}). ` +
        `Create this account in the app first.\n${detail}`,
    );
  }

  const cookies = signInResponse.headers.getSetCookie?.() ?? [];
  const cookieHeader = cookies.map((cookie) => cookie.split(';')[0]).join('; ');

  // Some versions return the token on the sign-in response header directly.
  const immediate = signInResponse.headers.get('set-auth-jwt');
  if (immediate) return immediate;

  const tokenResponse = await fetch(`${AUTH_URL}/token`, {
    headers: { Cookie: cookieHeader },
  });

  if (!tokenResponse.ok) {
    throw new Error(`Could not get a token for ${email} (${tokenResponse.status}).`);
  }

  const body = await tokenResponse.json();
  const token = body.token ?? tokenResponse.headers.get('set-auth-jwt');

  if (!token) throw new Error(`No token came back for ${email}.`);
  return token;
}

/** Read the user ID out of a token, without verifying it — display only. */
function userIdFrom(token) {
  const [, payload] = token.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return claims.sub;
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

function viaOurApi(token, path, options = {}) {
  return fetch(`${API_BASE_URL}/api${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

function viaDataApi(token, path, options = {}) {
  return fetch(`${DATA_API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const results = [];

function check(description, passed, detail) {
  results.push({ description, passed, detail });
  console.log(`  ${passed ? '✓' : '✗'} ${description}`);
  if (detail) console.log(`      ${detail}`);
}

// ---------------------------------------------------------------------------
// The test
// ---------------------------------------------------------------------------

async function main() {
  console.log('\nTwo-account privacy test');
  console.log('========================\n');
  console.log(`  API      ${API_BASE_URL}`);
  console.log(`  Data API ${DATA_API_URL}\n`);

  // ---- Sign both users in ----
  const tokenA = await signIn(
    required('TEST_USER_A_EMAIL'),
    required('TEST_USER_A_PASSWORD'),
  );
  const tokenB = await signIn(
    required('TEST_USER_B_EMAIL'),
    required('TEST_USER_B_PASSWORD'),
  );

  const idA = userIdFrom(tokenA);
  const idB = userIdFrom(tokenB);

  console.log(`  User A  ${idA}`);
  console.log(`  User B  ${idB}\n`);

  if (idA === idB) {
    console.error('Both accounts resolved to the same user. Check the credentials.');
    process.exit(1);
  }

  // ---- User A files a private contact ----
  const secretName = `RLS Test Subject ${Date.now()}`;
  const createResponse = await viaOurApi(tokenA, '/contacts', {
    method: 'POST',
    body: JSON.stringify({
      name: secretName,
      company: 'User A private company',
      notes: 'If User B can read this line, Row Level Security is not working.',
      priority: 'high',
    }),
  });

  if (!createResponse.ok) {
    console.error('User A could not create a contact:', await createResponse.text());
    process.exit(1);
  }

  const { contact } = await createResponse.json();
  console.log(`Setup: User A filed contact #${contact.id} — "${secretName}"\n`);

  // ---- Sanity check: the owner CAN reach it ----
  console.log('User A can reach their own contact:');
  {
    const response = await viaOurApi(tokenA, `/contacts/${contact.id}`);
    check('GET returns 200 for the owner', response.status === 200, `got ${response.status}`);

    const ownerRows = await viaDataApi(tokenA, `/contacts?id=eq.${contact.id}`).then((r) => r.json());
    check(
      'the database returns the row to its owner',
      Array.isArray(ownerRows) && ownerRows.length === 1,
      `${ownerRows.length ?? 0} row(s)`,
    );
  }

  // ---- Through our API ----
  console.log('\nUser B, through the Express API:');
  {
    const list = await viaOurApi(tokenB, '/contacts').then((r) => r.json());
    const leaked = (list.contacts ?? []).some((row) => row.id === contact.id);
    check("cannot see A's contact in their own list", !leaked,
      `list contained ${list.contacts?.length ?? 0} contact(s)`);

    const read = await viaOurApi(tokenB, `/contacts/${contact.id}`);
    check('cannot read it directly (404)', read.status === 404, `got ${read.status}`);

    const update = await viaOurApi(tokenB, `/contacts/${contact.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Hijacked by User B' }),
    });
    check('cannot edit it (404)', update.status === 404, `got ${update.status}`);

    const remove = await viaOurApi(tokenB, `/contacts/${contact.id}`, { method: 'DELETE' });
    check('cannot delete it (404)', remove.status === 404, `got ${remove.status}`);
  }

  // ---- Straight at the database, bypassing our API entirely ----
  console.log('\nUser B, bypassing our API and calling the database directly:');
  {
    const rows = await viaDataApi(tokenB, `/contacts?id=eq.${contact.id}`).then((r) => r.json());
    check(
      'SELECT returns no rows',
      Array.isArray(rows) && rows.length === 0,
      `${Array.isArray(rows) ? rows.length : '?'} row(s) — RLS filters rather than refusing, so an empty set is the expected answer`,
    );

    const all = await viaDataApi(tokenB, '/contacts?select=*').then((r) => r.json());
    const leaked = Array.isArray(all) && all.some((row) => row.user_id === idA);
    check("a full table scan returns none of A's rows", !leaked,
      `${Array.isArray(all) ? all.length : '?'} row(s) visible to B`);

    await viaDataApi(tokenB, `/contacts?id=eq.${contact.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ name: 'Hijacked by User B' }),
    });

    // Ask the owner whether anything actually changed.
    const after = await viaOurApi(tokenA, `/contacts/${contact.id}`).then((r) => r.json());
    check("UPDATE changed nothing — the name is still A's", after.contact?.name === secretName,
      `name is now "${after.contact?.name}"`);

    await viaDataApi(tokenB, `/contacts?id=eq.${contact.id}`, { method: 'DELETE' });
    const stillThere = await viaOurApi(tokenA, `/contacts/${contact.id}`);
    check('DELETE removed nothing — the row still exists', stillThere.status === 200,
      `owner GET returned ${stillThere.status}`);
  }

  // ---- Can B claim a row for A? ----
  console.log('\nUser B cannot file a contact under A\'s name:');
  {
    await viaDataApi(tokenB, '/contacts', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ name: 'Planted by B', user_id: idA }),
    });

    const listA = await viaOurApi(tokenA, '/contacts').then((r) => r.json());
    const planted = (listA.contacts ?? []).some((row) => row.name === 'Planted by B');
    check("nothing appeared in A's list", !planted);
  }

  // ---- Clean up ----
  await viaOurApi(tokenA, `/contacts/${contact.id}`, { method: 'DELETE' });
  console.log('\nCleanup: User A deleted the test contact.');

  // ---- Verdict ----
  const failed = results.filter((result) => !result.passed);
  console.log('\n========================');

  if (failed.length === 0) {
    console.log(`All ${results.length} checks passed. Row Level Security is working.\n`);
    process.exit(0);
  }

  console.log(`${failed.length} of ${results.length} checks FAILED:\n`);
  failed.forEach((result) => console.log(`  ✗ ${result.description}`));
  console.log('');
  process.exit(1);
}

main().catch((error) => {
  console.error('\nThe test could not run:\n', error.message, '\n');
  process.exit(1);
});
