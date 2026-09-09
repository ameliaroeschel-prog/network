/**
 * The four states every data view needs: loading, empty, error, and success.
 *
 * Keeping them here means they look the same everywhere, and none of them get
 * forgotten -- a blank screen while something loads is the most common way an
 * app feels broken when it is actually fine.
 */

/** Ruled placeholder cards, shaped like the real ones, shown while loading. */
export function LoadingCards({ count = 6 }) {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-label="Loading your contacts"
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="card" aria-hidden="true">
          <div className="card-tab bg-rule" />
          <div className="card-body">
            <div className="skeleton h-5 w-2/3" />
            <div className="card-rule" />
            <div className="space-y-2">
              <div className="skeleton h-3 w-1/2" />
              <div className="skeleton h-3 w-3/5" />
              <div className="skeleton h-3 w-2/5" />
            </div>
          </div>
        </div>
      ))}
      <span className="sr-only">Loading your contacts…</span>
    </div>
  );
}

/** Shown when there is genuinely nothing to show. */
export function EmptyState({ title, description, action }) {
  return (
    <div className="sheet flex flex-col items-center gap-3 py-14 text-center">
      {/* A blank index card, drawn inline. */}
      <svg
        width="56"
        height="40"
        viewBox="0 0 56 40"
        fill="none"
        aria-hidden="true"
        className="opacity-40"
      >
        <rect x="0.5" y="0.5" width="55" height="39" rx="2" fill="#FBF7EF" stroke="#C4B69F" />
        <rect x="1" y="1" width="5" height="38" fill="#D9CFBE" />
        <line x1="12" y1="13" x2="48" y2="13" stroke="#D9CFBE" strokeWidth="1.5" />
        <line x1="12" y1="21" x2="48" y2="21" stroke="#D9CFBE" strokeWidth="1.5" />
        <line x1="12" y1="29" x2="36" y2="29" stroke="#D9CFBE" strokeWidth="1.5" />
      </svg>

      <h2 className="font-serif text-lg font-semibold text-ink">{title}</h2>
      <p className="max-w-sm text-sm text-ink-soft">{description}</p>
      {action}
    </div>
  );
}

/** Shown when something failed. Always offers a way forward. */
export function ErrorState({ message, onRetry }) {
  return (
    <div
      className="sheet flex flex-col items-center gap-3 border-priority-high/40 py-12 text-center"
      role="alert"
    >
      <span className="label text-priority-high">Something went wrong</span>
      <p className="max-w-md text-sm text-ink-soft">{message}</p>
      {onRetry && (
        <button type="button" className="btn-secondary mt-1" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/**
 * A brief confirmation after a successful action.
 *
 * aria-live="polite" means a screen reader announces it without interrupting
 * whatever the person is doing.
 */
export function Toast({ message, onDismiss }) {
  if (!message) return null;

  return (
    <div
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-sm items-center
                 justify-between gap-4 rounded-card border border-ink bg-ink px-4 py-3
                 text-paper shadow-lifted sm:left-auto sm:right-6"
      role="status"
      aria-live="polite"
    >
      <span className="font-label text-label uppercase">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="font-label text-label uppercase text-paper/60 hover:text-paper"
        aria-label="Dismiss"
      >
        Close
      </button>
    </div>
  );
}
