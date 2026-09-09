/**
 * Contact validation.
 *
 * This module is imported by BOTH the Express API and the React UI, so the
 * rules are written once and cannot drift apart.
 *
 * Important: the copy running in the browser is a convenience, not a security
 * control. Anyone can edit the JavaScript in their own browser or skip it
 * entirely with curl. The validation that actually protects the data is:
 *
 *   1. This module running inside the Express API   (trusted server code)
 *   2. The CHECK constraints in db/schema.sql       (trusted database code)
 *
 * Three layers, and the two that count are ones the user cannot reach.
 */

import { CADENCES, toUtcDay } from './cadence.js';

/** The only priorities the database will accept. */
export const PRIORITIES = ['high', 'medium', 'low'];

/** Field length limits, matching the CHECK constraints in db/schema.sql. */
const MAX_LENGTH = {
  name: 200,
  company: 200,
  role: 200,
  where_met: 200,
  notes: 5000,
};

/** Fields a client is allowed to send. Anything else is dropped. */
const ALLOWED_FIELDS = [
  'name',
  'company',
  'role',
  'where_met',
  'notes',
  'priority',
  'last_contacted_on',
  'cadence',
  'cadence_days',
];

/** Human-readable field names for error messages. */
const FIELD_LABELS = {
  name: 'Name',
  company: 'Company',
  role: 'Role',
  where_met: 'Where you met',
  notes: 'Notes',
  priority: 'Priority',
  last_contacted_on: 'Last contacted',
  cadence: 'Follow-up frequency',
  cadence_days: 'Custom follow-up days',
};

/** Trim a string, or return null for anything empty or absent. */
function cleanText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

/**
 * Strip a client payload down to fields we recognise.
 *
 * This is why a client cannot send `user_id` and claim someone else's row: the
 * field never survives this function, so it never reaches the database, which
 * fills it in from the signed-in user's token instead.
 */
export function pickAllowedFields(input) {
  const result = {};
  for (const field of ALLOWED_FIELDS) {
    if (input != null && Object.hasOwn(input, field)) {
      result[field] = input[field];
    }
  }
  return result;
}

/**
 * Validate and normalise a contact.
 *
 * @param {object} input   Raw payload from the client
 * @param {{ partial?: boolean }} [options]
 *        partial: true for edits, where only the sent fields are checked
 * @returns {{ valid: boolean, errors: Record<string,string>, value: object|null }}
 *
 * Errors are returned as a map rather than thrown, so the UI can show a message
 * next to the field that caused it.
 */
export function validateContact(input, options = {}) {
  const { partial = false } = options;
  const data = pickAllowedFields(input);
  const errors = {};
  const value = {};

  // --- name: the only genuinely required field ----------------------------
  if (!partial || Object.hasOwn(data, 'name')) {
    const name = cleanText(data.name);
    if (!name) {
      errors.name = 'Name is required.';
    } else if (name.length > MAX_LENGTH.name) {
      errors.name = `Name must be ${MAX_LENGTH.name} characters or fewer.`;
    } else {
      value.name = name;
    }
  }

  // --- optional free-text fields ------------------------------------------
  for (const field of ['company', 'role', 'where_met', 'notes']) {
    if (partial && !Object.hasOwn(data, field)) continue;

    const text = cleanText(data[field]);
    if (text && text.length > MAX_LENGTH[field]) {
      errors[field] =
        `${FIELD_LABELS[field]} must be ${MAX_LENGTH[field]} characters or fewer.`;
    } else {
      value[field] = text;
    }
  }

  // --- priority: high | medium | low --------------------------------------
  if (!partial || Object.hasOwn(data, 'priority')) {
    const priority = cleanText(data.priority)?.toLowerCase() ?? null;

    if (priority === null) {
      // Absent is fine on create; the database default is 'medium'.
      if (!partial) value.priority = 'medium';
    } else if (!PRIORITIES.includes(priority)) {
      errors.priority = `Priority must be one of: ${PRIORITIES.join(', ')}.`;
    } else {
      value.priority = priority;
    }
  }

  // --- last_contacted_on: a real calendar date, not in the future ---------
  if (!partial || Object.hasOwn(data, 'last_contacted_on')) {
    const raw = data.last_contacted_on;

    if (raw == null || raw === '') {
      value.last_contacted_on = null;
    } else {
      const date = toUtcDay(raw);
      if (!date) {
        errors.last_contacted_on = 'Last contacted must be a valid date (YYYY-MM-DD).';
      } else if (date.getTime() > Date.now()) {
        errors.last_contacted_on = 'Last contacted cannot be in the future.';
      } else {
        value.last_contacted_on = date.toISOString().slice(0, 10);
      }
    }
  }

  // --- cadence and cadence_days, which depend on each other ---------------
  validateCadence(data, { partial, errors, value });

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    value: Object.keys(errors).length === 0 ? value : null,
  };
}

/**
 * cadence and cadence_days must agree: 'custom' requires a day count, and
 * every other cadence forbids one. This mirrors the
 * cadence_days_only_when_custom constraint in db/schema.sql.
 */
function validateCadence(data, { partial, errors, value }) {
  const touchesCadence =
    Object.hasOwn(data, 'cadence') || Object.hasOwn(data, 'cadence_days');

  if (partial && !touchesCadence) return;

  const cadence = cleanText(data.cadence)?.toLowerCase() ?? null;

  let resolved;
  if (cadence === null) {
    resolved = 'quarterly'; // matches the database default
  } else if (!CADENCES.includes(cadence)) {
    errors.cadence = `Follow-up frequency must be one of: ${CADENCES.join(', ')}.`;
    return;
  } else {
    resolved = cadence;
  }

  value.cadence = resolved;

  if (resolved === 'custom') {
    const raw = data.cadence_days;

    if (raw == null || raw === '') {
      errors.cadence_days = 'Choose how many days a custom follow-up should be.';
      return;
    }

    const days = Number(raw);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      errors.cadence_days = 'Custom follow-up must be a whole number of days between 1 and 3650.';
      return;
    }

    value.cadence_days = days;
  } else {
    // Not custom, so any day count sent is discarded rather than rejected --
    // it is almost always a leftover from the form, not a real mistake.
    value.cadence_days = null;
  }
}

/** Collapse an error map into one sentence, for logs and API responses. */
export function summariseErrors(errors) {
  return Object.values(errors).join(' ');
}
