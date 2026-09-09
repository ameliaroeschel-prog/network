/**
 * Contact routes — the whole CRUD surface.
 *
 *   GET    /api/contacts      list
 *   POST   /api/contacts      create
 *   GET    /api/contacts/:id  read one
 *   PATCH  /api/contacts/:id  update
 *   DELETE /api/contacts/:id  delete
 *
 * Every route runs behind requireAuth, so req.user and req.token are always
 * present by the time the handler runs.
 *
 * Two layers of protection on every write:
 *   1. validateContact() here in trusted server code
 *   2. CHECK constraints and RLS policies in Postgres
 * A request that gets past the first still has to satisfy the second.
 */

import { Router } from 'express';
import { validateContact, summariseErrors } from '../../../shared/validate.js';
import { dataApiFor, DataApiError } from '../dataApi.js';

export const contactsRouter = Router();

/** Columns the client may sort by. Anything else is rejected. */
const SORTABLE = new Set([
  'name',
  'company',
  'priority',
  'last_contacted_on',
  'created_at',
  'updated_at',
]);

/**
 * Turn ?sort=name&direction=asc into the Data API's ordering syntax.
 *
 * The allowlist matters: this value goes into the query sent to the database,
 * so accepting arbitrary text here would let a client inject their own
 * ordering expression. Only names we chose are ever passed through.
 */
function buildOrder(query) {
  const sort = String(query.sort ?? 'created_at');
  const direction = String(query.direction ?? 'desc').toLowerCase();

  const column = SORTABLE.has(sort) ? sort : 'created_at';
  const order = direction === 'asc' ? 'asc' : 'desc';

  // Put rows with no date last regardless of direction, so "never contacted"
  // never crowds out the people who actually need attention.
  return `${column}.${order}.nullslast`;
}

/** Send a consistent validation-failure response. */
function respondInvalid(res, errors) {
  return res.status(400).json({
    error: 'Invalid contact.',
    message: summariseErrors(errors),
    fields: errors,
  });
}

/** Turn a Data API failure into a sensible HTTP response. */
function respondDataApiError(res, error) {
  if (!(error instanceof DataApiError)) throw error;

  // A CHECK constraint or RLS policy refused the write. That is the database
  // doing its job, and it means bad input, not a server fault.
  if (error.status === 400 || error.status === 409 || error.status === 422) {
    return res.status(400).json({
      error: 'The database rejected that contact.',
      message: error.message,
    });
  }

  if (error.status === 401 || error.status === 403) {
    return res.status(403).json({
      error: 'Not allowed.',
      message: 'You do not have access to that contact.',
    });
  }

  throw error;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------
contactsRouter.get('/', async (req, res, next) => {
  try {
    const db = dataApiFor(req.token);
    const contacts = await db.listContacts({ orderBy: buildOrder(req.query) });
    res.json({ contacts });
  } catch (error) {
    try {
      respondDataApiError(res, error);
    } catch (rethrown) {
      next(rethrown);
    }
  }
});

// ---------------------------------------------------------------------------
// Read one
// ---------------------------------------------------------------------------
contactsRouter.get('/:id', async (req, res, next) => {
  try {
    const db = dataApiFor(req.token);
    const contact = await db.getContact(req.params.id);

    // Row Level Security means another user's contact simply does not appear.
    // We answer 404 rather than 403 so the response cannot be used to work out
    // whether a given ID exists for somebody else.
    if (!contact) {
      return res.status(404).json({
        error: 'Not found.',
        message: 'That contact does not exist.',
      });
    }

    res.json({ contact });
  } catch (error) {
    try {
      respondDataApiError(res, error);
    } catch (rethrown) {
      next(rethrown);
    }
  }
});

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
contactsRouter.post('/', async (req, res, next) => {
  const { valid, errors, value } = validateContact(req.body);
  if (!valid) return respondInvalid(res, errors);

  try {
    const db = dataApiFor(req.token);
    // `value` has already been stripped to known fields, so a user_id sent by
    // the client never reaches the database. Postgres fills it from the token.
    const contact = await db.createContact(value);
    res.status(201).json({ contact });
  } catch (error) {
    try {
      respondDataApiError(res, error);
    } catch (rethrown) {
      next(rethrown);
    }
  }
});

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
contactsRouter.patch('/:id', async (req, res, next) => {
  const { valid, errors, value } = validateContact(req.body, { partial: true });
  if (!valid) return respondInvalid(res, errors);

  if (Object.keys(value).length === 0) {
    return res.status(400).json({
      error: 'Nothing to update.',
      message: 'No changes were sent.',
    });
  }

  try {
    const db = dataApiFor(req.token);
    const contact = await db.updateContact(req.params.id, value);

    // Editing someone else's contact matches zero rows, so we land here and
    // answer 404 -- the row genuinely does not exist as far as this user is
    // concerned.
    if (!contact) {
      return res.status(404).json({
        error: 'Not found.',
        message: 'That contact does not exist.',
      });
    }

    res.json({ contact });
  } catch (error) {
    try {
      respondDataApiError(res, error);
    } catch (rethrown) {
      next(rethrown);
    }
  }
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
contactsRouter.delete('/:id', async (req, res, next) => {
  try {
    const db = dataApiFor(req.token);
    const contact = await db.deleteContact(req.params.id);

    if (!contact) {
      return res.status(404).json({
        error: 'Not found.',
        message: 'That contact does not exist.',
      });
    }

    res.json({ contact });
  } catch (error) {
    try {
      respondDataApiError(res, error);
    } catch (rethrown) {
      next(rethrown);
    }
  }
});
