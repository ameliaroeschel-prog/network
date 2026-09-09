/**
 * The add / edit form, shown in a dialog.
 *
 * It runs the SAME validation the server runs, imported from shared/validate.js,
 * so the messages you see here are the messages the API would give you. That is
 * a convenience, not a security control -- the server validates again, and the
 * database has its own constraints on top.
 */

import { useEffect, useRef, useState } from 'react';
import { validateContact, PRIORITIES } from '@shared/validate.js';
import { CADENCES, CADENCE_LABELS } from '@shared/cadence.js';

const BLANK = {
  name: '',
  company: '',
  role: '',
  where_met: '',
  notes: '',
  priority: 'medium',
  last_contacted_on: '',
  cadence: 'quarterly',
  cadence_days: '',
};

/** Turn a contact row into form values (nulls become empty strings). */
function toFormValues(contact) {
  if (!contact) return { ...BLANK };

  return {
    ...BLANK,
    ...Object.fromEntries(
      Object.keys(BLANK).map((key) => [key, contact[key] ?? '']),
    ),
  };
}

export function ContactForm({ contact, onSave, onCancel, saving, serverError }) {
  const [values, setValues] = useState(() => toFormValues(contact));
  const [errors, setErrors] = useState({});
  const dialogRef = useRef(null);
  const firstFieldRef = useRef(null);

  const isEditing = Boolean(contact?.id);

  // Open as a modal, which gives us focus trapping and Escape-to-close for free.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    firstFieldRef.current?.focus();
  }, []);

  // Native dialogs close on Escape; make sure our state follows.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (event) => {
      event.preventDefault();
      onCancel();
    };

    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onCancel]);

  function setField(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    // Clear a field's error as soon as the person starts fixing it.
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function handleSubmit(event) {
    event.preventDefault();

    const payload = {
      ...values,
      // An empty string means "not set"; the API expects null or absent.
      cadence_days:
        values.cadence === 'custom' && values.cadence_days !== ''
          ? Number(values.cadence_days)
          : undefined,
    };

    const result = validateContact(payload);

    if (!result.valid) {
      setErrors(result.errors);
      // Move focus to the first problem so keyboard users are not stranded.
      const firstBad = Object.keys(result.errors)[0];
      document.querySelector(`[name="${firstBad}"]`)?.focus();
      return;
    }

    onSave(result.value);
  }

  const fieldProps = (field) => ({
    name: field,
    value: values[field],
    onChange: (event) => setField(field, event.target.value),
    className: `input ${errors[field] ? 'input-invalid' : ''}`,
    'aria-invalid': errors[field] ? 'true' : undefined,
    'aria-describedby': errors[field] ? `${field}-error` : undefined,
  });

  return (
    <dialog
      ref={dialogRef}
      className="w-full max-w-xl rounded-card border border-rule-strong bg-paper p-0
                 text-ink shadow-lifted backdrop:bg-ink/40 backdrop:backdrop-blur-sm"
      aria-labelledby="contact-form-title"
    >
      <form onSubmit={handleSubmit} noValidate className="flex max-h-[85vh] flex-col">
        {/* ---- Header ---- */}
        <header className="flex items-center justify-between border-b border-rule px-5 py-4">
          <h2 id="contact-form-title" className="font-serif text-lg font-semibold">
            {isEditing ? 'Edit card' : 'New card'}
          </h2>
          <span className="label">{isEditing ? `No. ${contact.id}` : 'Unfiled'}</span>
        </header>

        {/* ---- Fields ---- */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {serverError && (
            <p className="mb-4 rounded-card border border-priority-high/40 bg-priority-high/5 px-3 py-2 text-sm text-priority-high" role="alert">
              {serverError}
            </p>
          )}

          <div className="flex flex-col gap-4">
            <div className="field">
              <label className="label" htmlFor="name">
                Name <span className="text-priority-high">*</span>
              </label>
              <input id="name" ref={firstFieldRef} type="text" autoComplete="off" {...fieldProps('name')} />
              {errors.name && (
                <p id="name-error" className="field-error">{errors.name}</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="field">
                <label className="label" htmlFor="company">Company</label>
                <input id="company" type="text" {...fieldProps('company')} />
                {errors.company && <p id="company-error" className="field-error">{errors.company}</p>}
              </div>

              <div className="field">
                <label className="label" htmlFor="role">Role</label>
                <input id="role" type="text" {...fieldProps('role')} />
                {errors.role && <p id="role-error" className="field-error">{errors.role}</p>}
              </div>
            </div>

            <div className="field">
              <label className="label" htmlFor="where_met">Where you met</label>
              <input id="where_met" type="text" placeholder="Haas@Work kickoff" {...fieldProps('where_met')} />
              {errors.where_met && <p id="where_met-error" className="field-error">{errors.where_met}</p>}
            </div>

            <div className="field">
              <label className="label" htmlFor="priority">Priority</label>
              <select id="priority" {...fieldProps('priority')}>
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </select>
              {errors.priority && <p id="priority-error" className="field-error">{errors.priority}</p>}
            </div>

            <div className="card-rule" />
            <p className="label">Staying in touch</p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="field">
                <label className="label" htmlFor="last_contacted_on">Last contacted</label>
                <input id="last_contacted_on" type="date" {...fieldProps('last_contacted_on')} />
                {errors.last_contacted_on ? (
                  <p id="last_contacted_on-error" className="field-error">{errors.last_contacted_on}</p>
                ) : (
                  <p className="field-hint">Leave blank if you have not spoken yet.</p>
                )}
              </div>

              <div className="field">
                <label className="label" htmlFor="cadence">Reach out</label>
                <select id="cadence" {...fieldProps('cadence')}>
                  {CADENCES.map((cadence) => (
                    <option key={cadence} value={cadence}>{CADENCE_LABELS[cadence]}</option>
                  ))}
                </select>
                {errors.cadence && <p id="cadence-error" className="field-error">{errors.cadence}</p>}
              </div>
            </div>

            {/* Only relevant when the cadence is custom. */}
            {values.cadence === 'custom' && (
              <div className="field">
                <label className="label" htmlFor="cadence_days">Every how many days?</label>
                <input
                  id="cadence_days"
                  type="number"
                  min="1"
                  max="3650"
                  placeholder="14"
                  {...fieldProps('cadence_days')}
                />
                {errors.cadence_days && (
                  <p id="cadence_days-error" className="field-error">{errors.cadence_days}</p>
                )}
              </div>
            )}

            <div className="field">
              <label className="label" htmlFor="notes">Notes</label>
              <textarea id="notes" rows={4} placeholder="What did you talk about? What did you promise to follow up on?" {...fieldProps('notes')} />
              {errors.notes && <p id="notes-error" className="field-error">{errors.notes}</p>}
            </div>
          </div>
        </div>

        {/* ---- Actions ---- */}
        <footer className="flex justify-end gap-2 border-t border-rule px-5 py-4">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Filing…' : isEditing ? 'Save changes' : 'File card'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
