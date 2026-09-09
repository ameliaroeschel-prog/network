/**
 * The application shell.
 *
 * Decides whether to show the sign-in screen or the card drawer, holds the
 * contact list, and coordinates loading, saving, sorting, and filtering.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCurrentUser, signOut } from './lib/neon.js';
import * as api from './lib/api.js';
import { computeFollowUp } from '@shared/cadence.js';
import { PRIORITIES } from '@shared/validate.js';
import { SignIn } from './routes/SignIn.jsx';
import { ContactCard } from './components/ContactCard.jsx';
import { ContactForm } from './components/ContactForm.jsx';
import { Calendar } from './components/Calendar.jsx';
import { LoadingCards, EmptyState, ErrorState, Toast } from './components/States.jsx';

const SORTS = [
  { value: 'created_at', label: 'Recently added', direction: 'desc' },
  { value: 'name', label: 'Name', direction: 'asc' },
  { value: 'priority', label: 'Priority', direction: 'asc' },
  { value: 'last_contacted_on', label: 'Last contacted', direction: 'desc' },
  { value: 'company', label: 'Company', direction: 'asc' },
];

/**
 * Priority sorts alphabetically in Postgres, which puts "low" before "medium".
 * Re-sorting here puts high first, which is what anyone would expect.
 */
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

export default function App() {
  // ---- Session --------------------------------------------------------
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  // ---- Contacts -------------------------------------------------------
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // ---- View controls --------------------------------------------------
  const [view, setView] = useState('drawer'); // 'drawer' | 'calendar'
  const [sort, setSort] = useState(SORTS[0]);
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [dueOnly, setDueOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [monthOffset, setMonthOffset] = useState(0);

  // ---- Editing --------------------------------------------------------
  const [editing, setEditing] = useState(null); // contact, or {} for a new one
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [toast, setToast] = useState(null);

  // On first load, ask whether there is already a session. This is what makes
  // a browser refresh keep you signed in.
  useEffect(() => {
    let cancelled = false;

    getCurrentUser().then((currentUser) => {
      if (cancelled) return;
      setUser(currentUser);
      setCheckingSession(false);
    });

    return () => { cancelled = true; };
  }, []);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const rows = await api.listContacts({
        sort: sort.value,
        direction: sort.direction,
      });
      setContacts(rows);
    } catch (error) {
      // An expired session should send you back to sign in, not show an error.
      if (error.status === 401) {
        setUser(null);
      } else {
        setLoadError(error.message);
      }
    } finally {
      setLoading(false);
    }
  }, [sort]);

  useEffect(() => {
    if (user) loadContacts();
  }, [user, loadContacts]);

  // Toasts clear themselves.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // ---- Actions --------------------------------------------------------

  async function handleSave(fields) {
    setSaving(true);
    setFormError(null);

    try {
      if (editing?.id) {
        const updated = await api.updateContact(editing.id, fields);
        setContacts((current) =>
          current.map((contact) => (contact.id === updated.id ? updated : contact)),
        );
        setToast('Card updated');
      } else {
        const created = await api.createContact(fields);
        setContacts((current) => [created, ...current]);
        setToast('Card filed');
      }

      setEditing(null);
    } catch (error) {
      if (error.status === 401) {
        setUser(null);
      } else {
        setFormError(error.message);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(contact) {
    const confirmed = window.confirm(
      `Remove ${contact.name} from your catalog? This cannot be undone.`,
    );
    if (!confirmed) return;

    // Remove it straight away so the UI feels immediate, and put it back if
    // the request fails.
    const previous = contacts;
    setContacts((current) => current.filter((row) => row.id !== contact.id));

    try {
      await api.deleteContact(contact.id);
      setToast('Card removed');
    } catch (error) {
      setContacts(previous);
      if (error.status === 401) setUser(null);
      else setToast(error.message);
    }
  }

  async function handleSignOut() {
    await signOut();
    setUser(null);
    setContacts([]);
  }

  // ---- Filtering and sorting -----------------------------------------

  const visible = useMemo(() => {
    const now = new Date();
    const term = search.trim().toLowerCase();

    let rows = contacts;

    if (priorityFilter !== 'all') {
      rows = rows.filter((contact) => contact.priority === priorityFilter);
    }

    if (dueOnly) {
      rows = rows.filter((contact) => computeFollowUp(contact, now).isDue);
    }

    if (term) {
      rows = rows.filter((contact) =>
        [contact.name, contact.company, contact.role, contact.where_met, contact.notes]
          .filter(Boolean)
          .some((field) => field.toLowerCase().includes(term)),
      );
    }

    // The server already sorted; only priority needs fixing up.
    if (sort.value === 'priority') {
      rows = [...rows].sort(
        (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
      );
    }

    return rows;
  }, [contacts, priorityFilter, dueOnly, search, sort]);

  const dueCount = useMemo(() => {
    const now = new Date();
    return contacts.filter((contact) => computeFollowUp(contact, now).isDue).length;
  }, [contacts]);

  // ---- Render ---------------------------------------------------------

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="label" role="status">Opening the drawer…</p>
      </main>
    );
  }

  if (!user) {
    return <SignIn onSignedIn={() => getCurrentUser().then(setUser)} />;
  }

  const filtersActive = priorityFilter !== 'all' || dueOnly || search.trim() !== '';

  return (
    <div className="min-h-screen">
      {/* ---- Header ---- */}
      <header className="sticky top-0 z-20 border-b border-rule-strong bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-stretch border border-rule-strong">
            <div className="w-1.5 bg-priority-high" aria-hidden="true" />
            <div className="px-3 py-1">
              <p className="font-serif font-bold leading-tight">Card Catalog</p>
              <p className="label leading-tight">
                {contacts.length} {contacts.length === 1 ? 'card' : 'cards'}
              </p>
            </div>
          </div>

          {/* View switch */}
          <nav className="flex gap-1" aria-label="Views">
            <button
              type="button"
              onClick={() => setView('drawer')}
              className={view === 'drawer' ? 'btn-primary' : 'btn-quiet'}
              aria-pressed={view === 'drawer'}
            >
              Drawer
            </button>
            <button
              type="button"
              onClick={() => setView('calendar')}
              className={view === 'calendar' ? 'btn-primary' : 'btn-quiet'}
              aria-pressed={view === 'calendar'}
            >
              This week
              {dueCount > 0 && (
                <span className="ml-1 rounded-full bg-priority-high px-1.5 text-[0.65rem] text-paper">
                  {dueCount}
                </span>
              )}
            </button>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="btn-primary" onClick={() => { setEditing({}); setFormError(null); }}>
              + New card
            </button>
            <button type="button" className="btn-quiet" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="drawer">
        {view === 'calendar' ? (
          <Calendar
            contacts={contacts}
            monthOffset={monthOffset}
            onMonthChange={setMonthOffset}
            onEdit={(contact) => { setEditing(contact); setFormError(null); }}
          />
        ) : (
          <>
            {/* ---- Sort and filter ---- */}
            <div className="mb-5 flex flex-wrap items-end gap-3">
              <div className="field min-w-[12rem] flex-1">
                <label className="label" htmlFor="search">Search</label>
                <input
                  id="search"
                  type="search"
                  className="input"
                  placeholder="Name, company, where you met…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="sort">Sort by</label>
                <select
                  id="sort"
                  className="input"
                  value={sort.value}
                  onChange={(event) =>
                    setSort(SORTS.find((option) => option.value === event.target.value))
                  }
                >
                  {SORTS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="label" htmlFor="priority-filter">Priority</label>
                <select
                  id="priority-filter"
                  className="input"
                  value={priorityFilter}
                  onChange={(event) => setPriorityFilter(event.target.value)}
                >
                  <option value="all">All</option>
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </select>
              </div>

              <label className="btn-secondary cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="mr-1 accent-ink"
                  checked={dueOnly}
                  onChange={(event) => setDueOnly(event.target.checked)}
                />
                Needs follow-up
              </label>
            </div>

            {/* ---- The cards ---- */}
            {loading ? (
              <LoadingCards />
            ) : loadError ? (
              <ErrorState message={loadError} onRetry={loadContacts} />
            ) : contacts.length === 0 ? (
              <EmptyState
                title="This drawer is empty"
                description="Add the first person you want to stay in touch with. Everything you file here is private to your account."
                action={
                  <button type="button" className="btn-primary mt-1" onClick={() => setEditing({})}>
                    + New card
                  </button>
                }
              />
            ) : visible.length === 0 ? (
              <EmptyState
                title="No cards match"
                description="Nothing in your drawer matches these filters. Try clearing them."
                action={
                  <button
                    type="button"
                    className="btn-secondary mt-1"
                    onClick={() => { setPriorityFilter('all'); setDueOnly(false); setSearch(''); }}
                  >
                    Clear filters
                  </button>
                }
              />
            ) : (
              <>
                {filtersActive && (
                  <p className="label mb-3" role="status">
                    Showing {visible.length} of {contacts.length}
                  </p>
                )}

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {visible.map((contact) => (
                    <ContactCard
                      key={contact.id}
                      contact={contact}
                      onEdit={(row) => { setEditing(row); setFormError(null); }}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>

      {editing && (
        <ContactForm
          key={editing.id ?? 'new'}
          contact={editing.id ? editing : null}
          saving={saving}
          serverError={formError}
          onSave={handleSave}
          onCancel={() => { setEditing(null); setFormError(null); }}
        />
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
