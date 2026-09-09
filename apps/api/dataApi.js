/**
 * A thin client for the Neon Data API.
 *
 * The Neon Data API is a REST layer sitting in front of Postgres (it speaks
 * PostgREST). We send it the SIGNED-IN USER'S OWN TOKEN on every call. That is
 * the whole security design:
 *
 *   - Postgres sees the request as that specific user
 *   - auth.user_id() inside the database resolves to their ID
 *   - the Row Level Security policies in db/schema.sql filter to their rows
 *
 * So even if a bug in this API asked for every contact in the table, the
 * database would still return only the rows belonging to the person who asked.
 *
 * IMPORTANT: a client is built PER REQUEST from that request's token. Sharing
 * one client across requests is how one user's token ends up serving another
 * user's data.
 */

const DATA_API_URL = process.env.NEON_DATA_API_URL;

if (!DATA_API_URL) {
  throw new Error(
    'NEON_DATA_API_URL is not set. Copy .env.example to .env.local and fill it in.',
  );
}

const BASE_URL = DATA_API_URL.replace(/\/+$/, '');

/** Raised when the Data API returns something that is not a success. */
export class DataApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'DataApiError';
    this.status = status;
    this.details = details;
  }
}

/**
 * Build a Data API client bound to one user's token.
 * @param {string} token The verified token from the incoming request.
 */
export function dataApiFor(token) {
  async function request(path, options = {}) {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        // This header is what makes Row Level Security work.
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const text = await response.text();
    const body = text ? safeJsonParse(text) : null;

    if (!response.ok) {
      throw new DataApiError(
        body?.message || body?.hint || 'The database rejected that request.',
        response.status,
        body,
      );
    }

    return body;
  }

  return {
    /**
     * List the signed-in user's contacts.
     * No user_id filter is needed -- Row Level Security applies it in the
     * database. We could not read someone else's rows even by asking.
     */
    listContacts({ orderBy = 'created_at.desc' } = {}) {
      const params = new URLSearchParams({ select: '*', order: orderBy });
      return request(`/contacts?${params}`);
    },

    /** Fetch one contact by ID. Returns undefined if it is not theirs. */
    async getContact(id) {
      const params = new URLSearchParams({ select: '*', id: `eq.${id}` });
      const rows = await request(`/contacts?${params}`);
      return rows?.[0];
    },

    /**
     * Create a contact.
     * Note we never send user_id -- the column defaults to auth.user_id(), so
     * the database stamps the owner from the token itself.
     */
    async createContact(fields) {
      const rows = await request('/contacts', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(fields),
      });
      return rows?.[0];
    },

    /**
     * Update a contact.
     * If the row belongs to someone else, Row Level Security means no row
     * matches and this returns undefined -- which the route turns into a 404.
     */
    async updateContact(id, fields) {
      const params = new URLSearchParams({ id: `eq.${id}` });
      const rows = await request(`/contacts?${params}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(fields),
      });
      return rows?.[0];
    },

    /** Delete a contact. Returns the deleted row, or undefined if not theirs. */
    async deleteContact(id) {
      const params = new URLSearchParams({ id: `eq.${id}` });
      const rows = await request(`/contacts?${params}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' },
      });
      return rows?.[0];
    },
  };
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}
