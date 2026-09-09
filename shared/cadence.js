/**
 * Follow-up cadence logic.
 *
 * Everything about "who should I reach out to this week" is DERIVED from two
 * columns: last_contacted_on and cadence. Nothing about the schedule is stored
 * in the database, so there is no second table to secure and nothing to keep
 * in sync.
 *
 * Every function here is pure -- same input, same output, no network, no
 * clock reads except the `today` you pass in. That is what makes it easy to
 * test, and it is why the test suite can assert exact results.
 */

/** How many days each named cadence means. */
export const CADENCE_DAYS = {
  monthly: 30,
  quarterly: 91,
  annually: 365,
};

/** The cadence values the database CHECK constraint allows. */
export const CADENCES = ['monthly', 'quarterly', 'annually', 'custom'];

/** Human labels for the UI. */
export const CADENCE_LABELS = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
  custom: 'Custom',
};

/** A follow-up is "due this week" if it lands within this many days. */
const WEEK = 7;

// ---------------------------------------------------------------------------
// Date helpers
//
// Dates here are calendar days, not moments in time. Someone contacted on
// 3 March was contacted on 3 March regardless of timezone. So we normalise
// everything to UTC midnight and do integer day arithmetic. Mixing local-time
// and UTC dates is the classic source of off-by-one-day bugs.
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Turn a value into a UTC-midnight Date, or null if it is not a usable date.
 * Accepts 'YYYY-MM-DD' strings (what Postgres `date` columns return) and Dates.
 */
export function toUtcDay(value) {
  if (value == null || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
    ));
  }

  if (typeof value === 'string') {
    // Match only the date part, so a full timestamp works too.
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (!match) return null;

    const [, year, month, day] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    // Rejects impossible dates like 2026-02-31, which JS would otherwise roll
    // forward into March.
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }
    return date;
  }

  return null;
}

/** Format a Date as the 'YYYY-MM-DD' string Postgres expects. */
export function toDateString(date) {
  const utc = toUtcDay(date);
  return utc ? utc.toISOString().slice(0, 10) : null;
}

/** Whole days from `from` to `to`. Negative means `to` is in the past. */
export function daysBetween(from, to) {
  return Math.round((toUtcDay(to) - toUtcDay(from)) / MS_PER_DAY);
}

/** A new Date `days` after `date`. */
export function addDays(date, days) {
  const utc = toUtcDay(date);
  return new Date(utc.getTime() + days * MS_PER_DAY);
}

/**
 * How many days this contact's cadence means.
 * Custom cadences carry their own day count.
 */
export function intervalDays(contact) {
  if (contact.cadence === 'custom') {
    const days = Number(contact.cadence_days);
    return Number.isFinite(days) && days > 0 ? days : null;
  }
  return CADENCE_DAYS[contact.cadence] ?? null;
}

// ---------------------------------------------------------------------------
// The main function
// ---------------------------------------------------------------------------

/**
 * Work out when a contact is next due, and how urgent that is.
 *
 * @param {object} contact  A contact row (last_contacted_on, cadence, cadence_days)
 * @param {Date|string} [today]  Defaults to now. Pass a fixed value in tests.
 * @returns {{
 *   dueOn: string|null,        'YYYY-MM-DD', or null if never contacted
 *   daysUntilDue: number|null, negative = overdue by that many days
 *   status: 'never-contacted'|'overdue'|'due-this-week'|'upcoming',
 *   isDue: boolean             true when they need reaching out to now or this week
 * }}
 */
export function computeFollowUp(contact, today = new Date()) {
  const lastContacted = toUtcDay(contact?.last_contacted_on);
  const interval = intervalDays(contact ?? {});

  // Never contacted, or no usable cadence: there is nothing to count from.
  // These people surface in the UI as needing a first outreach.
  if (!lastContacted || !interval) {
    return {
      dueOn: null,
      daysUntilDue: null,
      status: 'never-contacted',
      isDue: true,
    };
  }

  const dueDate = addDays(lastContacted, interval);
  const daysUntilDue = daysBetween(today, dueDate);

  let status;
  if (daysUntilDue < 0) status = 'overdue';
  else if (daysUntilDue <= WEEK) status = 'due-this-week';
  else status = 'upcoming';

  return {
    dueOn: toDateString(dueDate),
    daysUntilDue,
    status,
    isDue: status === 'overdue' || status === 'due-this-week',
  };
}

/**
 * Everyone who needs reaching out to now -- overdue first, then soonest due,
 * then contacts never contacted at all.
 */
export function dueThisWeek(contacts, today = new Date()) {
  return contacts
    .map((contact) => ({ contact, followUp: computeFollowUp(contact, today) }))
    .filter(({ followUp }) => followUp.isDue)
    .sort((a, b) => {
      // Never-contacted has no due date; sort those last.
      const left = a.followUp.daysUntilDue;
      const right = b.followUp.daysUntilDue;
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return left - right;
    });
}

/**
 * Group contacts by the calendar day they are due, for the month calendar.
 * Returns a Map of 'YYYY-MM-DD' -> array of contacts.
 * Contacts with no due date are omitted; they appear in the "needs a first
 * hello" list instead.
 */
export function groupByDueDate(contacts, today = new Date()) {
  const byDay = new Map();

  for (const contact of contacts) {
    const { dueOn } = computeFollowUp(contact, today);
    if (!dueOn) continue;
    if (!byDay.has(dueOn)) byDay.set(dueOn, []);
    byDay.get(dueOn).push(contact);
  }

  return byDay;
}

/** Short human phrase for a follow-up, e.g. "12 days overdue". */
export function describeFollowUp(followUp) {
  const { status, daysUntilDue } = followUp;

  if (status === 'never-contacted') return 'No contact logged';
  if (daysUntilDue === 0) return 'Due today';

  if (status === 'overdue') {
    const days = Math.abs(daysUntilDue);
    return days === 1 ? '1 day overdue' : `${days} days overdue`;
  }

  return daysUntilDue === 1 ? 'Due tomorrow' : `Due in ${daysUntilDue} days`;
}
