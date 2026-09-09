/**
 * Tests for contact validation.
 *
 * These are the tests that prove the assignment's requirement:
 * "Empty names and invalid priority values fail with a clear error message."
 *
 * They run against the same module the Express API uses, so passing here means
 * the server rejects the same input.
 */

import { describe, it, expect } from 'vitest';
import {
  validateContact,
  pickAllowedFields,
  summariseErrors,
  PRIORITIES,
} from '../shared/validate.js';

/** A valid contact, used as the starting point for most tests. */
function validContact(overrides = {}) {
  return {
    name: 'Marcus Chen',
    company: 'Zebra Technologies',
    role: 'VP Product Strategy',
    where_met: 'Haas@Work kickoff',
    notes: 'Offered to introduce me to their CPO.',
    priority: 'high',
    last_contacted_on: '2026-06-14',
    cadence: 'quarterly',
    ...overrides,
  };
}

describe('name is required', () => {
  it('rejects a missing name', () => {
    const result = validateContact(validContact({ name: undefined }));

    expect(result.valid).toBe(false);
    expect(result.errors.name).toBe('Name is required.');
    expect(result.value).toBeNull();
  });

  it('rejects an empty name', () => {
    const result = validateContact(validContact({ name: '' }));

    expect(result.valid).toBe(false);
    expect(result.errors.name).toBe('Name is required.');
  });

  it('rejects a name that is only whitespace', () => {
    const result = validateContact(validContact({ name: '     ' }));

    expect(result.valid).toBe(false);
    expect(result.errors.name).toBe('Name is required.');
  });

  it('rejects a name longer than 200 characters', () => {
    const result = validateContact(validContact({ name: 'a'.repeat(201) }));

    expect(result.valid).toBe(false);
    expect(result.errors.name).toMatch(/200 characters or fewer/);
  });

  it('trims surrounding whitespace from an otherwise good name', () => {
    const result = validateContact(validContact({ name: '  Marcus Chen  ' }));

    expect(result.valid).toBe(true);
    expect(result.value.name).toBe('Marcus Chen');
  });
});

describe('priority accepts only high, medium, or low', () => {
  it.each(PRIORITIES)('accepts "%s"', (priority) => {
    const result = validateContact(validContact({ priority }));

    expect(result.valid).toBe(true);
    expect(result.value.priority).toBe(priority);
  });

  it('rejects a priority outside the allowed set', () => {
    const result = validateContact(validContact({ priority: 'urgent' }));

    expect(result.valid).toBe(false);
    expect(result.errors.priority).toBe('Priority must be one of: high, medium, low.');
  });

  it('rejects a numeric priority', () => {
    const result = validateContact(validContact({ priority: 1 }));

    expect(result.valid).toBe(false);
    expect(result.errors.priority).toBeDefined();
  });

  it('normalises capitalisation', () => {
    const result = validateContact(validContact({ priority: 'HIGH' }));

    expect(result.valid).toBe(true);
    expect(result.value.priority).toBe('high');
  });

  it('defaults to medium when priority is not sent on create', () => {
    const result = validateContact(validContact({ priority: undefined }));

    expect(result.valid).toBe(true);
    expect(result.value.priority).toBe('medium');
  });
});

describe('cadence and cadence_days must agree', () => {
  it('rejects a custom cadence with no day count', () => {
    const result = validateContact(
      validContact({ cadence: 'custom', cadence_days: undefined }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors.cadence_days).toMatch(/how many days/);
  });

  it('accepts a custom cadence with a valid day count', () => {
    const result = validateContact(
      validContact({ cadence: 'custom', cadence_days: 14 }),
    );

    expect(result.valid).toBe(true);
    expect(result.value.cadence).toBe('custom');
    expect(result.value.cadence_days).toBe(14);
  });

  it('rejects a fractional day count', () => {
    const result = validateContact(
      validContact({ cadence: 'custom', cadence_days: 7.5 }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors.cadence_days).toMatch(/whole number/);
  });

  it('rejects a day count outside 1 to 3650', () => {
    expect(
      validateContact(validContact({ cadence: 'custom', cadence_days: 0 })).valid,
    ).toBe(false);
    expect(
      validateContact(validContact({ cadence: 'custom', cadence_days: 4000 })).valid,
    ).toBe(false);
  });

  it('discards a leftover day count when the cadence is not custom', () => {
    const result = validateContact(
      validContact({ cadence: 'monthly', cadence_days: 14 }),
    );

    expect(result.valid).toBe(true);
    expect(result.value.cadence_days).toBeNull();
  });

  it('rejects an unknown cadence', () => {
    const result = validateContact(validContact({ cadence: 'fortnightly' }));

    expect(result.valid).toBe(false);
    expect(result.errors.cadence).toMatch(/monthly, quarterly, annually, custom/);
  });
});

describe('last_contacted_on', () => {
  it('rejects a date that does not exist', () => {
    const result = validateContact(validContact({ last_contacted_on: '2026-02-31' }));

    expect(result.valid).toBe(false);
    expect(result.errors.last_contacted_on).toMatch(/valid date/);
  });

  it('rejects text that is not a date', () => {
    const result = validateContact(validContact({ last_contacted_on: 'last Tuesday' }));

    expect(result.valid).toBe(false);
  });

  it('rejects a date in the future', () => {
    const result = validateContact(validContact({ last_contacted_on: '2099-01-01' }));

    expect(result.valid).toBe(false);
    expect(result.errors.last_contacted_on).toMatch(/cannot be in the future/);
  });

  it('accepts an empty value as "never contacted"', () => {
    const result = validateContact(validContact({ last_contacted_on: '' }));

    expect(result.valid).toBe(true);
    expect(result.value.last_contacted_on).toBeNull();
  });
});

describe('field stripping — the security-relevant part', () => {
  it('drops user_id so a client can never claim another user\'s row', () => {
    const picked = pickAllowedFields({
      name: 'Marcus Chen',
      user_id: 'someone-elses-user-id',
    });

    expect(picked.name).toBe('Marcus Chen');
    expect(picked).not.toHaveProperty('user_id');
  });

  it('drops id, created_at, and any unknown field', () => {
    const picked = pickAllowedFields({
      name: 'Marcus Chen',
      id: 999,
      created_at: '2020-01-01',
      updated_at: '2020-01-01',
      is_admin: true,
    });

    expect(Object.keys(picked)).toEqual(['name']);
  });

  it('keeps user_id out of the validated output even when sent', () => {
    const result = validateContact({ name: 'Marcus Chen', user_id: 'attacker' });

    expect(result.valid).toBe(true);
    expect(result.value).not.toHaveProperty('user_id');
  });
});

describe('partial validation for edits', () => {
  it('does not require a name when only priority is being changed', () => {
    const result = validateContact({ priority: 'low' }, { partial: true });

    expect(result.valid).toBe(true);
    expect(result.value.priority).toBe('low');
    expect(result.value).not.toHaveProperty('name');
  });

  it('still rejects a bad priority on a partial edit', () => {
    const result = validateContact({ priority: 'urgent' }, { partial: true });

    expect(result.valid).toBe(false);
  });

  it('still rejects an empty name when the name is the field being changed', () => {
    const result = validateContact({ name: '   ' }, { partial: true });

    expect(result.valid).toBe(false);
    expect(result.errors.name).toBe('Name is required.');
  });
});

describe('a fully valid contact', () => {
  it('passes and returns normalised values', () => {
    const result = validateContact(validContact());

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
    expect(result.value).toMatchObject({
      name: 'Marcus Chen',
      company: 'Zebra Technologies',
      role: 'VP Product Strategy',
      where_met: 'Haas@Work kickoff',
      priority: 'high',
      cadence: 'quarterly',
      last_contacted_on: '2026-06-14',
      cadence_days: null,
    });
  });

  it('accepts a contact with only a name', () => {
    const result = validateContact({ name: 'Marcus Chen' });

    expect(result.valid).toBe(true);
    expect(result.value.company).toBeNull();
  });
});

describe('summariseErrors', () => {
  it('joins every message into one sentence for the API response', () => {
    const { errors } = validateContact({ name: '', priority: 'urgent' });

    expect(summariseErrors(errors)).toBe(
      'Name is required. Priority must be one of: high, medium, low.',
    );
  });
});
