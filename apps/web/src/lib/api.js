/**
 * The contacts API client.
 *
 * Every call goes to our own Express API at /api, never to Neon directly.
 * The API validates the request, then forwards the token to the database.
 *
 * In development Vite proxies /api to localhost:3001; in production Vercel
 * routes it to the serverless function. Either way this code is the same,
 * which is why there is no base URL to configure and no CORS to worry about.
 */

import { getAccessToken } from './neon.js';

/** Thrown when the API returns an error. Carries per-field messages if any. */
export class ApiError extends Error {
  constructor(message, { status, fields } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields ?? {};
  }
}

async function apiRequest(path, options = {}) {
  const token = await getAccessToken();

  if (!token) {
    throw new ApiError('Your session has ended. Please sign in again.', {
      status: 401,
    });
  }

  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } catch {
    // fetch only rejects on a network-level failure, not on a 4xx or 5xx.
    throw new ApiError(
      'Could not reach the server. Check your connection and try again.',
      { status: 0 },
    );
  }

  const text = await response.text();
  const body = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    throw new ApiError(body?.message ?? 'Something went wrong. Please try again.', {
      status: response.status,
      fields: body?.fields,
    });
  }

  return body;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * List contacts.
 * @param {{ sort?: string, direction?: 'asc'|'desc' }} [options]
 */
export async function listContacts({ sort, direction } = {}) {
  const params = new URLSearchParams();
  if (sort) params.set('sort', sort);
  if (direction) params.set('direction', direction);

  const query = params.toString();
  const body = await apiRequest(`/contacts${query ? `?${query}` : ''}`);
  return body.contacts ?? [];
}

export async function createContact(fields) {
  const body = await apiRequest('/contacts', {
    method: 'POST',
    body: JSON.stringify(fields),
  });
  return body.contact;
}

export async function updateContact(id, fields) {
  const body = await apiRequest(`/contacts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
  return body.contact;
}

export async function deleteContact(id) {
  const body = await apiRequest(`/contacts/${id}`, { method: 'DELETE' });
  return body.contact;
}
