/**
 * Tests for the Express API routes.
 *
 * These run the REAL Express app -- real routing, real validation, real error
 * handling -- with two things swapped out for test doubles:
 *
 *   auth.js     so tests do not need a live token from Neon
 *   dataApi.js  so tests do not need a live database
 *
 * That leaves exactly the layer we want to test: does the API accept good
 * requests, reject bad ones with a clear message, and never let an
 * unauthenticated caller through?
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/** Stands in for the Neon Data API. Each test sets what it should return. */
const db = {
  listContacts: vi.fn(),
  getContact: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  deleteContact: vi.fn(),
};

/** Records the arguments the routes pass through, so tests can inspect them. */
let lastTokenUsed = null;

class FakeDataApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

vi.mock('../apps/api/dataApi.js', () => ({
  dataApiFor: (token) => {
    lastTokenUsed = token;
    return db;
  },
  DataApiError: FakeDataApiError,
}));

/**
 * Stands in for the real auth middleware.
 *
 * It keeps the real behaviour we want to test -- reject anything without a
 * Bearer token -- but skips the cryptographic signature check, which would
 * need a live key from Neon. Signature verification is exercised against the
 * real service during the manual two-account test documented in the README.
 */
vi.mock('../apps/api/auth.js', () => ({
  requireAuth: (req, res, next) => {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');

    if (!/^Bearer$/i.test(scheme) || !token) {
      return res.status(401).json({
        error: 'Not signed in.',
        message: 'This request needs a valid session. Try signing in again.',
      });
    }

    req.user = { id: 'user-a', email: 'a@example.com' };
    req.token = token;
    next();
  },
  verifyToken: vi.fn(),
}));

// Imported after the mocks are registered, so it picks them up.
const { createApp } = await import('../apps/api/app.js');
const app = createApp();

const TEST_TOKEN = 'Bearer test-token-abc';

/**
 * A request carrying a valid-looking token.
 * supertest needs the HTTP verb before headers can be set, so this returns an
 * object of verb helpers rather than a bare agent.
 */
const asUser = () => ({
  get: (path) => request(app).get(path).set('Authorization', TEST_TOKEN),
  post: (path) => request(app).post(path).set('Authorization', TEST_TOKEN),
  patch: (path) => request(app).patch(path).set('Authorization', TEST_TOKEN),
  delete: (path) => request(app).delete(path).set('Authorization', TEST_TOKEN),
});

const sampleContact = {
  id: 1,
  user_id: 'user-a',
  name: 'Marcus Chen',
  company: 'Zebra Technologies',
  priority: 'high',
  cadence: 'quarterly',
};

beforeEach(() => {
  vi.clearAllMocks();
  lastTokenUsed = null;
});

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
describe('authentication is required', () => {
  it('rejects a list request with no Authorization header', async () => {
    const response = await request(app).get('/api/contacts');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Not signed in.');
    expect(db.listContacts).not.toHaveBeenCalled();
  });

  it('rejects a create request with no Authorization header', async () => {
    const response = await request(app)
      .post('/api/contacts')
      .send({ name: 'Marcus Chen' });

    expect(response.status).toBe(401);
    expect(db.createContact).not.toHaveBeenCalled();
  });

  it('rejects a malformed Authorization header', async () => {
    const response = await request(app)
      .get('/api/contacts')
      .set('Authorization', 'test-token-abc'); // missing "Bearer"

    expect(response.status).toBe(401);
  });

  it('passes the caller\'s own token through to the database layer', async () => {
    db.listContacts.mockResolvedValue([]);

    await request(app)
      .get('/api/contacts')
      .set('Authorization', 'Bearer token-for-user-a');

    // This is what makes Row Level Security work: the database sees the
    // signed-in user's token, not a shared admin credential.
    expect(lastTokenUsed).toBe('token-for-user-a');
  });
});

// ---------------------------------------------------------------------------
// Validation — the assignment's "fails safely with a clear message"
// ---------------------------------------------------------------------------
describe('POST /api/contacts rejects invalid input', () => {
  it('returns 400 and a readable message for an empty name', async () => {
    const response = await asUser().post('/api/contacts').send({ name: '' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Name is required.');
    expect(response.body.fields.name).toBe('Name is required.');

    // Nothing reached the database.
    expect(db.createContact).not.toHaveBeenCalled();
  });

  it('returns 400 for a missing name', async () => {
    const response = await asUser()
      .post('/api/contacts')
      .send({ company: 'Zebra Technologies' });

    expect(response.status).toBe(400);
    expect(response.body.fields.name).toBe('Name is required.');
  });

  it('returns 400 for a priority outside high, medium, low', async () => {
    const response = await asUser()
      .post('/api/contacts')
      .send({ name: 'Marcus Chen', priority: 'urgent' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Priority must be one of: high, medium, low.');
    expect(db.createContact).not.toHaveBeenCalled();
  });

  it('returns 400 for a custom cadence with no day count', async () => {
    const response = await asUser()
      .post('/api/contacts')
      .send({ name: 'Marcus Chen', cadence: 'custom' });

    expect(response.status).toBe(400);
    expect(response.body.fields.cadence_days).toBeDefined();
  });

  it('reports every problem at once, not just the first', async () => {
    const response = await asUser()
      .post('/api/contacts')
      .send({ name: '', priority: 'urgent' });

    expect(response.status).toBe(400);
    expect(response.body.fields.name).toBeDefined();
    expect(response.body.fields.priority).toBeDefined();
  });

  it('returns 400 for malformed JSON rather than crashing', async () => {
    const response = await asUser()
      .post('/api/contacts')
      .set('Content-Type', 'application/json')
      .send('{"name": "unclosed');

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/valid JSON/);
  });
});

// ---------------------------------------------------------------------------
// Ownership cannot be forged
// ---------------------------------------------------------------------------
describe('a client cannot choose who owns a contact', () => {
  it('strips user_id from a create request', async () => {
    db.createContact.mockResolvedValue(sampleContact);

    await asUser()
      .post('/api/contacts')
      .send({ name: 'Marcus Chen', user_id: 'user-b' });

    const sentToDatabase = db.createContact.mock.calls[0][0];

    // user_id never reaches the database. Postgres fills it in from the
    // token via the auth.user_id() column default.
    expect(sentToDatabase).not.toHaveProperty('user_id');
    expect(sentToDatabase.name).toBe('Marcus Chen');
  });

  it('strips user_id from an update request', async () => {
    db.updateContact.mockResolvedValue(sampleContact);

    await asUser()
      .patch('/api/contacts/1')
      .send({ name: 'Marcus Chen', user_id: 'user-b' });

    expect(db.updateContact.mock.calls[0][1]).not.toHaveProperty('user_id');
  });

  it('strips id and created_at from a create request', async () => {
    db.createContact.mockResolvedValue(sampleContact);

    await asUser()
      .post('/api/contacts')
      .send({ name: 'Marcus Chen', id: 999, created_at: '2020-01-01' });

    const sentToDatabase = db.createContact.mock.calls[0][0];
    expect(sentToDatabase).not.toHaveProperty('id');
    expect(sentToDatabase).not.toHaveProperty('created_at');
  });
});

// ---------------------------------------------------------------------------
// Another user's contact simply does not exist
// ---------------------------------------------------------------------------
describe('Row Level Security surfaces as 404, not 403', () => {
  it('returns 404 when reading a contact that is not yours', async () => {
    // RLS filtered the row out, so the database returned nothing.
    db.getContact.mockResolvedValue(undefined);

    const response = await asUser().get('/api/contacts/999');

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('That contact does not exist.');
  });

  it('returns 404 when updating a contact that is not yours', async () => {
    db.updateContact.mockResolvedValue(undefined);

    const response = await asUser()
      .patch('/api/contacts/999')
      .send({ name: 'Hijacked' });

    expect(response.status).toBe(404);
  });

  it('returns 404 when deleting a contact that is not yours', async () => {
    db.deleteContact.mockResolvedValue(undefined);

    const response = await asUser().delete('/api/contacts/999');

    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// The happy paths
// ---------------------------------------------------------------------------
describe('successful requests', () => {
  it('lists contacts', async () => {
    db.listContacts.mockResolvedValue([sampleContact]);

    const response = await asUser().get('/api/contacts');

    expect(response.status).toBe(200);
    expect(response.body.contacts).toHaveLength(1);
    expect(response.body.contacts[0].name).toBe('Marcus Chen');
  });

  it('creates a contact and returns 201', async () => {
    db.createContact.mockResolvedValue(sampleContact);

    const response = await asUser()
      .post('/api/contacts')
      .send({ name: 'Marcus Chen', priority: 'high' });

    expect(response.status).toBe(201);
    expect(response.body.contact.name).toBe('Marcus Chen');
  });

  it('updates a contact', async () => {
    db.updateContact.mockResolvedValue({ ...sampleContact, priority: 'low' });

    const response = await asUser()
      .patch('/api/contacts/1')
      .send({ priority: 'low' });

    expect(response.status).toBe(200);
    expect(response.body.contact.priority).toBe('low');
  });

  it('deletes a contact', async () => {
    db.deleteContact.mockResolvedValue(sampleContact);

    const response = await asUser().delete('/api/contacts/1');

    expect(response.status).toBe(200);
  });

  it('rejects an update that sends no changes', async () => {
    const response = await asUser().patch('/api/contacts/1').send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Nothing to update.');
    expect(db.updateContact).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------
describe('sorting', () => {
  it('passes an allowed sort column through to the database', async () => {
    db.listContacts.mockResolvedValue([]);

    await asUser().get('/api/contacts?sort=name&direction=asc');

    expect(db.listContacts).toHaveBeenCalledWith({ orderBy: 'name.asc.nullslast' });
  });

  it('ignores a sort column that is not on the allowlist', async () => {
    db.listContacts.mockResolvedValue([]);

    // A column name we never approved must not reach the database query.
    await asUser().get('/api/contacts?sort=user_id&direction=asc');

    expect(db.listContacts).toHaveBeenCalledWith({
      orderBy: 'created_at.asc.nullslast',
    });
  });

  it('ignores a direction that is not asc or desc', async () => {
    db.listContacts.mockResolvedValue([]);

    await asUser().get('/api/contacts?sort=name&direction=; DROP TABLE contacts');

    expect(db.listContacts).toHaveBeenCalledWith({ orderBy: 'name.desc.nullslast' });
  });
});

// ---------------------------------------------------------------------------
// Errors do not leak internals
// ---------------------------------------------------------------------------
describe('error handling', () => {
  it('turns a database rejection into a 400 with a safe message', async () => {
    db.createContact.mockRejectedValue(
      new FakeDataApiError('new row violates check constraint "contacts_priority_check"', 400),
    );

    const response = await asUser()
      .post('/api/contacts')
      .send({ name: 'Marcus Chen' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('The database rejected that contact.');
  });

  it('hides internal details when something unexpected breaks', async () => {
    // Silence the expected console.error for this one test.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.listContacts.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.1:5432'));

    const response = await asUser().get('/api/contacts');

    expect(response.status).toBe(500);
    expect(response.body.message).toBe('Something went wrong on our end. Please try again.');
    // The internal address must not reach the browser.
    expect(JSON.stringify(response.body)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(response.body)).not.toContain('10.0.0.1');

    spy.mockRestore();
  });

  it('returns 404 JSON for an unknown API route', async () => {
    const response = await asUser().get('/api/nonsense');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Not found.');
  });
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
describe('GET /api/health', () => {
  it('responds without a token, and reveals nothing sensitive', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(Object.keys(response.body).sort()).toEqual(['status', 'time']);
  });
});
