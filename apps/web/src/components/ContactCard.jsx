/**
 * One contact, drawn as a library catalog card.
 *
 * The coloured tab down the left edge shows priority. Colour is never the only
 * signal -- the priority is also written out in the corner, and the follow-up
 * status is written in words.
 */

import { computeFollowUp, describeFollowUp } from '@shared/cadence.js';

const TAB_COLOR = {
  high: 'bg-priority-high',
  medium: 'bg-priority-medium',
  low: 'bg-priority-low',
};

const PRIORITY_TEXT = {
  high: 'text-priority-high border-priority-high/40',
  medium: 'text-priority-medium border-priority-medium/40',
  low: 'text-priority-low border-priority-low/40',
};

const STATUS_TEXT = {
  overdue: 'text-overdue',
  'due-this-week': 'text-due',
  upcoming: 'text-ink-faint',
  'never-contacted': 'text-ink-faint',
};

/** One labelled line on the card, e.g. "CO.  Zebra Technologies". */
function CardField({ label, value }) {
  if (!value) return null;

  return (
    <div className="flex gap-3">
      <dt className="label w-14 shrink-0 pt-0.5">{label}</dt>
      <dd className="flex-1 text-[0.95rem] leading-snug text-ink-soft">{value}</dd>
    </div>
  );
}

export function ContactCard({ contact, onEdit, onDelete, today }) {
  const followUp = computeFollowUp(contact, today);

  return (
    <article className="card group">
      {/* Priority tab. aria-hidden because the priority is also written below. */}
      <div
        className={`card-tab ${TAB_COLOR[contact.priority] ?? 'bg-rule'}`}
        aria-hidden="true"
      />

      <div className="card-body">
        {/* ---- Name and priority ---- */}
        <header className="flex items-start justify-between gap-3">
          <h3 className="font-serif text-name font-semibold text-ink">{contact.name}</h3>
          <span
            className={`chip shrink-0 ${PRIORITY_TEXT[contact.priority] ?? ''}`}
            title={`${contact.priority} priority`}
          >
            {contact.priority}
          </span>
        </header>

        <div className="card-rule" />

        {/* ---- The catalog fields ---- */}
        <dl className="flex flex-col gap-2">
          <CardField label="Co." value={contact.company} />
          <CardField label="Role" value={contact.role} />
          <CardField label="Met" value={contact.where_met} />
        </dl>

        {contact.notes && (
          <>
            <div className="card-rule" />
            <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed text-ink-soft">
              {contact.notes}
            </p>
          </>
        )}

        {/* ---- Follow-up status, pushed to the bottom ---- */}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
          <span className={`label normal-case ${STATUS_TEXT[followUp.status]}`}>
            {describeFollowUp(followUp)}
          </span>

          {/* Actions stay visible on touch devices, where there is no hover. */}
          <div className="flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            <button
              type="button"
              className="btn-quiet px-2 py-1"
              onClick={() => onEdit(contact)}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn-quiet px-2 py-1 text-priority-high hover:bg-priority-high/10"
              onClick={() => onDelete(contact)}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
