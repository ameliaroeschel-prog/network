/**
 * Sign in and sign up.
 *
 * One form that switches between the two modes, so there is no second page to
 * keep in step.
 */

import { useState } from 'react';
import { signIn, signUp } from '../lib/neon.js';

export function SignIn({ onSignedIn }) {
  const [mode, setMode] = useState('sign-in');
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const isSignUp = mode === 'sign-up';

  function setField(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    // Checked here so the person gets an answer without a round trip. Neon
    // enforces its own rules server-side regardless.
    if (isSignUp && values.name.trim() === '') {
      setError('Please enter your name.');
      setBusy(false);
      return;
    }
    if (values.password.length < 8) {
      setError('Your password needs to be at least 8 characters.');
      setBusy(false);
      return;
    }

    const result = isSignUp
      ? await signUp({
          name: values.name.trim(),
          email: values.email.trim(),
          password: values.password,
        })
      : await signIn({ email: values.email.trim(), password: values.password });

    setBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    onSignedIn();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        {/* ---- Masthead ---- */}
        <header className="mb-6 text-center">
          <div className="mx-auto mb-4 flex w-fit items-stretch border border-rule-strong bg-paper shadow-card">
            <div className="w-2 bg-priority-high" aria-hidden="true" />
            <div className="px-5 py-3 text-left">
              <p className="font-serif text-xl font-bold leading-tight text-ink">
                Card Catalog
              </p>
              <p className="label">Networking tracker</p>
            </div>
          </div>

          <p className="text-sm text-ink-soft">
            A private drawer of cards for the people you want to stay connected with.
          </p>
        </header>

        {/* ---- Form ---- */}
        <form onSubmit={handleSubmit} noValidate className="sheet flex flex-col gap-4">
          <div className="flex gap-1 border-b border-rule pb-3">
            <button
              type="button"
              onClick={() => { setMode('sign-in'); setError(null); }}
              className={`btn flex-1 ${!isSignUp ? 'border-ink bg-ink text-paper' : 'border-transparent text-ink-soft hover:bg-paper-aged'}`}
              aria-pressed={!isSignUp}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => { setMode('sign-up'); setError(null); }}
              className={`btn flex-1 ${isSignUp ? 'border-ink bg-ink text-paper' : 'border-transparent text-ink-soft hover:bg-paper-aged'}`}
              aria-pressed={isSignUp}
            >
              Create account
            </button>
          </div>

          {error && (
            <p
              className="rounded-card border border-priority-high/40 bg-priority-high/5 px-3 py-2 text-sm text-priority-high"
              role="alert"
            >
              {error}
            </p>
          )}

          {isSignUp && (
            <div className="field">
              <label className="label" htmlFor="name">Your name</label>
              <input
                id="name"
                type="text"
                className="input"
                autoComplete="name"
                value={values.name}
                onChange={(event) => setField('name', event.target.value)}
              />
            </div>
          )}

          <div className="field">
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              className="input"
              autoComplete="email"
              value={values.email}
              onChange={(event) => setField('email', event.target.value)}
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              className="input"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              value={values.password}
              onChange={(event) => setField('password', event.target.value)}
            />
            {isSignUp && <p className="field-hint">At least 8 characters.</p>}
          </div>

          <button type="submit" className="btn-primary mt-1" disabled={busy}>
            {busy ? 'Just a moment…' : isSignUp ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="mt-5 text-center text-xs leading-relaxed text-ink-faint">
          Your cards are private to your account. Nobody else can read them —
          not even another signed-in user.
        </p>
      </div>
    </main>
  );
}
