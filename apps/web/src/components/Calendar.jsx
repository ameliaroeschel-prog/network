/**
 * The follow-up calendar.
 *
 * Nothing here is stored in the database. Every date is worked out from each
 * contact's last_contacted_on and cadence by computeFollowUp(), so the calendar
 * can never drift out of sync with the cards.
 *
 * On a narrow screen the month grid would be unreadable, so it becomes an
 * agenda list instead.
 */

import { useMemo } from 'react';
import {
  computeFollowUp,
  describeFollowUp,
  dueThisWeek,
  groupByDueDate,
  toDateString,
} from '@shared/cadence.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DOT_COLOR = {
  high: 'bg-priority-high',
  medium: 'bg-priority-medium',
  low: 'bg-priority-low',
};

/** Every day to show in a month grid, padded to whole weeks (Monday start). */
function monthGrid(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  // getUTCDay() is 0 for Sunday; shift so Monday is 0.
  const leading = (first.getUTCDay() + 6) % 7;

  const start = new Date(Date.UTC(year, month, 1 - leading));
  const days = [];

  for (let index = 0; index < 42; index += 1) {
    const day = new Date(start.getTime() + index * 86400000);
    days.push({
      date: day,
      key: toDateString(day),
      inMonth: day.getUTCMonth() === month,
    });
  }

  // Drop a trailing all-padding week so short months do not show a blank row.
  return days.slice(0, days[35].date.getUTCMonth() === month ? 42 : 35);
}

/** The list of people to reach out to, shown above the grid. */
function ThisWeek({ contacts, today, onEdit }) {
  const due = useMemo(() => dueThisWeek(contacts, today), [contacts, today]);

  if (due.length === 0) {
    return (
      <div className="sheet">
        <p className="label mb-1">Reach out this week</p>
        <p className="text-sm text-ink-soft">
          Nobody is due. Everyone you track has been contacted within their cadence.
        </p>
      </div>
    );
  }

  return (
    <div className="sheet">
      <p className="label mb-3">
        Reach out this week — {due.length} {due.length === 1 ? 'person' : 'people'}
      </p>

      <ul className="flex flex-col divide-y divide-rule">
        {due.map(({ contact, followUp }) => (
          <li key={contact.id} className="flex items-center gap-3 py-2.5">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${DOT_COLOR[contact.priority] ?? 'bg-rule'}`}
              aria-hidden="true"
            />

            <div className="min-w-0 flex-1">
              <p className="truncate font-serif font-semibold text-ink">{contact.name}</p>
              <p className="truncate text-sm text-ink-faint">
                {[contact.role, contact.company].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>

            <span
              className={`label shrink-0 normal-case ${
                followUp.status === 'overdue' ? 'text-overdue' : 'text-due'
              }`}
            >
              {describeFollowUp(followUp)}
            </span>

            <button type="button" className="btn-quiet shrink-0 px-2 py-1" onClick={() => onEdit(contact)}>
              Log
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Calendar({ contacts, today, monthOffset, onMonthChange, onEdit }) {
  const now = today ? new Date(today) : new Date();
  const viewed = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1));

  const year = viewed.getUTCFullYear();
  const month = viewed.getUTCMonth();

  const days = useMemo(() => monthGrid(year, month), [year, month]);
  const byDay = useMemo(() => groupByDueDate(contacts, now), [contacts, now]);
  const todayKey = toDateString(now);

  const monthLabel = viewed.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  /** People due on a given day, for the agenda list. */
  const agenda = days
    .filter((day) => day.inMonth && byDay.has(day.key))
    .map((day) => ({ day, people: byDay.get(day.key) }));

  return (
    <div className="flex flex-col gap-5">
      <ThisWeek contacts={contacts} today={now} onEdit={onEdit} />

      <div className="sheet">
        {/* ---- Month navigation ---- */}
        <header className="mb-4 flex items-center justify-between">
          <button type="button" className="btn-secondary px-3 py-1" onClick={() => onMonthChange(monthOffset - 1)}>
            ← Prev
          </button>

          <div className="text-center">
            <p className="font-serif text-lg font-semibold">{monthLabel}</p>
            {monthOffset !== 0 && (
              <button type="button" className="label underline hover:text-ink" onClick={() => onMonthChange(0)}>
                Back to today
              </button>
            )}
          </div>

          <button type="button" className="btn-secondary px-3 py-1" onClick={() => onMonthChange(monthOffset + 1)}>
            Next →
          </button>
        </header>

        {/* ---- Month grid: desktop and tablet ---- */}
        <div className="hidden sm:block">
          <div className="grid grid-cols-7 gap-px">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} className="label pb-1 text-center">{weekday}</div>
            ))}

            {days.map(({ date, key, inMonth }) => {
              const people = byDay.get(key) ?? [];
              const isToday = key === todayKey;

              return (
                <div
                  key={key}
                  className={`calendar-cell ${!inMonth ? 'calendar-cell-muted' : ''} ${
                    isToday ? 'calendar-cell-today' : ''
                  }`}
                >
                  <span className={`label ${isToday ? 'text-ink' : ''}`}>
                    {date.getUTCDate()}
                  </span>

                  <div className="flex flex-col gap-0.5">
                    {people.slice(0, 3).map((contact) => (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => onEdit(contact)}
                        className="flex items-center gap-1 truncate rounded-sm px-1 py-0.5 text-left
                                   text-[0.7rem] leading-tight text-ink-soft hover:bg-paper-deep"
                        title={contact.name}
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_COLOR[contact.priority] ?? 'bg-rule'}`}
                          aria-hidden="true"
                        />
                        <span className="truncate">{contact.name}</span>
                      </button>
                    ))}

                    {people.length > 3 && (
                      <span className="label px-1">+{people.length - 3} more</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ---- Agenda list: mobile ---- */}
        <div className="sm:hidden">
          {agenda.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-soft">
              No follow-ups fall in {monthLabel}.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-rule">
              {agenda.map(({ day, people }) => (
                <li key={day.key} className="py-3">
                  <p className="label mb-2">
                    {day.date.toLocaleDateString('en-GB', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      timeZone: 'UTC',
                    })}
                  </p>

                  <ul className="flex flex-col gap-1.5">
                    {people.map((contact) => (
                      <li key={contact.id}>
                        <button
                          type="button"
                          onClick={() => onEdit(contact)}
                          className="flex w-full items-center gap-2 text-left"
                        >
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${DOT_COLOR[contact.priority] ?? 'bg-rule'}`}
                            aria-hidden="true"
                          />
                          <span className="truncate font-serif text-ink">{contact.name}</span>
                          <span className="ml-auto shrink-0 text-xs text-ink-faint">
                            {contact.company}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
