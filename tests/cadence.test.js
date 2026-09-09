/**
 * Tests for the follow-up cadence logic.
 *
 * Every test passes a FIXED `today`, so these results never change based on
 * when the suite runs. A test that passes in March and fails in April is worse
 * than no test at all.
 */

import { describe, it, expect } from 'vitest';
import {
  computeFollowUp,
  describeFollowUp,
  dueThisWeek,
  groupByDueDate,
  toUtcDay,
  daysBetween,
} from '../shared/cadence.js';

// A fixed reference point for every test in this file.
const TODAY = '2026-09-01';

/** Build a contact that was last contacted N days before TODAY. */
function contactedDaysAgo(days, extra = {}) {
  const date = new Date(Date.UTC(2026, 8, 1) - days * 86400000);
  return {
    name: 'Test Person',
    cadence: 'quarterly',
    last_contacted_on: date.toISOString().slice(0, 10),
    ...extra,
  };
}

describe('computeFollowUp', () => {
  it('flags a quarterly contact last spoken to 100 days ago as overdue', () => {
    const result = computeFollowUp(contactedDaysAgo(100), TODAY);

    expect(result.status).toBe('overdue');
    expect(result.daysUntilDue).toBe(-9); // quarterly is 91 days; 100 - 91 = 9
    expect(result.isDue).toBe(true);
  });

  it('flags a monthly contact last spoken to 28 days ago as due this week', () => {
    const result = computeFollowUp(
      contactedDaysAgo(28, { cadence: 'monthly' }),
      TODAY,
    );

    expect(result.status).toBe('due-this-week');
    expect(result.daysUntilDue).toBe(2); // monthly is 30 days; 30 - 28 = 2
    expect(result.isDue).toBe(true);
  });

  it('treats a contact with no last_contacted_on as never contacted', () => {
    const result = computeFollowUp(
      { name: 'New Person', cadence: 'quarterly', last_contacted_on: null },
      TODAY,
    );

    expect(result.status).toBe('never-contacted');
    expect(result.dueOn).toBeNull();
    expect(result.daysUntilDue).toBeNull();
    // Still surfaces in the UI -- they need a first hello.
    expect(result.isDue).toBe(true);
  });

  it('honours a custom cadence of 14 days', () => {
    const result = computeFollowUp(
      contactedDaysAgo(20, { cadence: 'custom', cadence_days: 14 }),
      TODAY,
    );

    expect(result.status).toBe('overdue');
    expect(result.daysUntilDue).toBe(-6); // 14 - 20 = -6
    expect(result.dueOn).toBe('2026-08-26');
  });

  it('leaves an annual contact from last month as upcoming', () => {
    const result = computeFollowUp(
      contactedDaysAgo(30, { cadence: 'annually' }),
      TODAY,
    );

    expect(result.status).toBe('upcoming');
    expect(result.daysUntilDue).toBe(335); // 365 - 30
    expect(result.isDue).toBe(false);
  });

  it('counts a contact due exactly today as due this week, not overdue', () => {
    const result = computeFollowUp(
      contactedDaysAgo(91, { cadence: 'quarterly' }),
      TODAY,
    );

    expect(result.daysUntilDue).toBe(0);
    expect(result.status).toBe('due-this-week');
  });

  it('treats the 7-day boundary as due this week and 8 days as upcoming', () => {
    const atBoundary = computeFollowUp(
      contactedDaysAgo(84, { cadence: 'quarterly' }), // 91 - 84 = 7
      TODAY,
    );
    const pastBoundary = computeFollowUp(
      contactedDaysAgo(83, { cadence: 'quarterly' }), // 91 - 83 = 8
      TODAY,
    );

    expect(atBoundary.status).toBe('due-this-week');
    expect(pastBoundary.status).toBe('upcoming');
  });

  it('falls back to never-contacted when a custom cadence has no day count', () => {
    const result = computeFollowUp(
      contactedDaysAgo(10, { cadence: 'custom', cadence_days: null }),
      TODAY,
    );

    expect(result.status).toBe('never-contacted');
  });
});

describe('toUtcDay', () => {
  it('rejects dates that do not exist', () => {
    // Plain `new Date()` would silently roll this forward into March.
    expect(toUtcDay('2026-02-31')).toBeNull();
  });

  it('rejects text that is not a date', () => {
    expect(toUtcDay('not a date')).toBeNull();
    expect(toUtcDay('')).toBeNull();
    expect(toUtcDay(null)).toBeNull();
  });

  it('parses a plain YYYY-MM-DD string at UTC midnight', () => {
    const date = toUtcDay('2026-09-01');
    expect(date.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });
});

describe('daysBetween', () => {
  it('counts forwards and backwards', () => {
    expect(daysBetween('2026-09-01', '2026-09-08')).toBe(7);
    expect(daysBetween('2026-09-08', '2026-09-01')).toBe(-7);
    expect(daysBetween('2026-09-01', '2026-09-01')).toBe(0);
  });

  it('counts correctly across a month boundary', () => {
    expect(daysBetween('2026-08-30', '2026-09-02')).toBe(3);
  });
});

describe('dueThisWeek', () => {
  it('returns only the people who need reaching out to, most overdue first', () => {
    const contacts = [
      { name: 'Upcoming',  cadence: 'annually',  last_contacted_on: '2026-08-25' },
      { name: 'Overdue',   cadence: 'monthly',   last_contacted_on: '2026-07-01' },
      { name: 'This week', cadence: 'monthly',   last_contacted_on: '2026-08-05' },
      { name: 'Never',     cadence: 'quarterly', last_contacted_on: null },
    ];

    const result = dueThisWeek(contacts, TODAY);
    const names = result.map((entry) => entry.contact.name);

    expect(names).toEqual(['Overdue', 'This week', 'Never']);
    expect(names).not.toContain('Upcoming');
  });

  it('returns an empty list when nobody is due', () => {
    const contacts = [
      { name: 'Fine', cadence: 'annually', last_contacted_on: '2026-08-25' },
    ];
    expect(dueThisWeek(contacts, TODAY)).toEqual([]);
  });
});

describe('groupByDueDate', () => {
  it('buckets contacts by the day they come due', () => {
    const contacts = [
      { name: 'A', cadence: 'monthly', last_contacted_on: '2026-08-20' },
      { name: 'B', cadence: 'monthly', last_contacted_on: '2026-08-20' },
      { name: 'C', cadence: 'monthly', last_contacted_on: '2026-08-21' },
    ];

    const grouped = groupByDueDate(contacts, TODAY);

    expect(grouped.get('2026-09-19').map((c) => c.name)).toEqual(['A', 'B']);
    expect(grouped.get('2026-09-20').map((c) => c.name)).toEqual(['C']);
  });

  it('omits contacts that have no due date', () => {
    const grouped = groupByDueDate(
      [{ name: 'Never', cadence: 'quarterly', last_contacted_on: null }],
      TODAY,
    );
    expect(grouped.size).toBe(0);
  });
});

describe('describeFollowUp', () => {
  it('phrases each status the way the UI shows it', () => {
    expect(describeFollowUp({ status: 'overdue', daysUntilDue: -1 })).toBe('1 day overdue');
    expect(describeFollowUp({ status: 'overdue', daysUntilDue: -12 })).toBe('12 days overdue');
    expect(describeFollowUp({ status: 'due-this-week', daysUntilDue: 0 })).toBe('Due today');
    expect(describeFollowUp({ status: 'due-this-week', daysUntilDue: 1 })).toBe('Due tomorrow');
    expect(describeFollowUp({ status: 'upcoming', daysUntilDue: 40 })).toBe('Due in 40 days');
    expect(describeFollowUp({ status: 'never-contacted', daysUntilDue: null })).toBe('No contact logged');
  });
});
