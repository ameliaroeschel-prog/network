/**
 * Design preview — sample data, no sign-in, no database.
 *
 * This exists so the look of the app can be reviewed without a live Neon
 * project. It is not part of the shipped application and is excluded from the
 * production build.
 */

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ContactCard } from './components/ContactCard.jsx';
import { Calendar } from './components/Calendar.jsx';
import { LoadingCards, EmptyState, ErrorState } from './components/States.jsx';
import './styles/tokens.css';

const TODAY = new Date('2026-09-08T00:00:00Z');

const SAMPLE = [
  {
    id: 1,
    name: 'Marcus Chen',
    company: 'Zebra Technologies',
    role: 'VP Product Strategy',
    where_met: 'Haas@Work kickoff',
    notes: 'Sharp on supply-chain edge cases. Offered to introduce me to their CPO.',
    priority: 'high',
    last_contacted_on: '2026-05-20',
    cadence: 'quarterly',
  },
  {
    id: 2,
    name: 'Priya Raman',
    company: 'Bessemer Venture Partners',
    role: 'Partner, Enterprise',
    where_met: "Dean's speaker series",
    notes: 'Asked me to send the market sizing deck once it is cleaned up.',
    priority: 'high',
    last_contacted_on: '2026-09-02',
    cadence: 'monthly',
  },
  {
    id: 3,
    name: 'Daniel Okafor',
    company: 'Stripe',
    role: 'Engineering Manager',
    where_met: 'Career fair, Chou Hall',
    notes: '',
    priority: 'medium',
    last_contacted_on: '2026-08-30',
    cadence: 'custom',
    cadence_days: 14,
  },
  {
    id: 4,
    name: 'Sofia Almeida',
    company: 'McKinsey & Company',
    role: 'Engagement Manager',
    where_met: 'Consulting club coffee chat',
    notes: 'Berkeley MBA 2022. Happy to review case prep in the spring.',
    priority: 'medium',
    last_contacted_on: '2026-06-15',
    cadence: 'quarterly',
  },
  {
    id: 5,
    name: 'Tom Wheeler',
    company: 'Anthropic',
    role: 'Product Lead',
    where_met: 'AI in Business guest lecture',
    notes: 'Mentioned a summer internship posting in January.',
    priority: 'low',
    last_contacted_on: null,
    cadence: 'annually',
  },
  {
    id: 6,
    name: 'Grace Lim',
    company: 'Sequoia Capital',
    role: 'Talent Partner',
    where_met: 'Alumni mixer, San Francisco',
    notes: 'Runs the portfolio talent network. Follow up after recruiting season.',
    priority: 'low',
    last_contacted_on: '2026-03-11',
    cadence: 'annually',
  },
];

function Section({ title, note, children }) {
  return (
    <section className="mb-12">
      <div className="mb-4 border-b border-rule-strong pb-2">
        <h2 className="font-serif text-lg font-bold">{title}</h2>
        {note && <p className="label normal-case">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Preview() {
  const [monthOffset, setMonthOffset] = useState(0);
  const noop = () => {};

  return (
    <div className="min-h-screen">
      <header className="border-b border-rule-strong bg-paper/95 py-4">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex items-stretch border border-rule-strong">
            <div className="w-1.5 bg-priority-high" aria-hidden="true" />
            <div className="px-3 py-1">
              <p className="font-serif font-bold leading-tight">Card Catalog</p>
              <p className="label leading-tight">Design preview</p>
            </div>
          </div>
          <p className="label ml-auto">Sample data · not connected to a database</p>
        </div>
      </header>

      <main className="drawer">
        <Section title="The drawer" note="Six cards, three priorities">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SAMPLE.map((contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                today={TODAY}
                onEdit={noop}
                onDelete={noop}
              />
            ))}
          </div>
        </Section>

        <Section title="This week" note="Follow-up calendar, derived from cadence">
          <Calendar
            contacts={SAMPLE}
            today={TODAY}
            monthOffset={monthOffset}
            onMonthChange={setMonthOffset}
            onEdit={noop}
          />
        </Section>

        <Section title="Loading state">
          <LoadingCards count={3} />
        </Section>

        <Section title="Empty and error states">
          <div className="grid gap-4 lg:grid-cols-2">
            <EmptyState
              title="This drawer is empty"
              description="Add the first person you want to stay in touch with."
              action={<button type="button" className="btn-primary mt-1">+ New card</button>}
            />
            <ErrorState
              message="Could not reach the server. Check your connection and try again."
              onRetry={noop}
            />
          </div>
        </Section>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Preview />
  </React.StrictMode>,
);
