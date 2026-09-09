# Card Catalog — a secure networking tracker

A private card catalog for the people you want to stay connected with at Berkeley.
Each person is an index card: who they are, where you met, what you talked about,
how important they are, and how often you mean to reach out. The app works out
who is overdue and shows you a weekly follow-up list, so staying in touch stops
depending on memory. Every card belongs to exactly one account, and that
ownership is enforced by Postgres itself through Row Level Security — not by the
application code, and not by hiding a button in the interface.

**Live app:** https://temporary-sonic-atoll-xkwtx4t.vercel.app

---

## Contents

- [Screenshots](#screenshots)
- [Features](#features)
- [Technology stack, and why](#technology-stack-and-why)
- [Architecture](#architecture)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Database schema](#database-schema)
- [Authentication and ownership](#authentication-and-ownership)
- [Tests](#tests)
- [Grading evidence](#grading-evidence)
- [Deployment](#deployment)
- [Known limitations](#known-limitations)

---

## Screenshots

_[to be added: the drawer, the follow-up calendar, sign-in, the add/edit form,
a validation error, and the two-account privacy test]_

---

## Features

**Contacts**
- Add a contact with name, company, role, where you met, notes, and priority
- Priority is limited to `high`, `medium`, or `low` — enforced in the database
- Edit and delete your own contacts
- Sort by recently added, name, priority, last contacted, or company
- Filter by priority, by "needs follow-up", or by a free-text search across every field
- Contacts survive a refresh, because they live in Neon Postgres

**Staying in touch**
- Record when you last spoke to someone
- Choose a cadence: monthly, quarterly, annually, or a custom number of days
- A "Reach out this week" list, ordered by who is most overdue
- A month calendar showing when each person comes due

**Interface**
- Explicit loading, empty, success, and error states — never a blank screen
- Works on phones and desktops; the month grid becomes an agenda list on small screens
- Keyboard accessible, with visible focus styles and labelled form fields
- Colour is never the only signal: priority and follow-up status are always written out

**Security**
- Row Level Security on the contacts table, with a separate policy per operation
- Ownership is stamped by the database, never sent by the browser
- Validation in three places: the browser, the API, and the database
- No Postgres connection string exists anywhere in this project

---

## Technology stack, and why

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React 18 + Vite | The assignment asks for a separated frontend. Vite builds a plain static site, which Vercel serves from its CDN with nothing to run. |
| Styling | Tailwind CSS with a custom theme | Tailwind is the design system; every colour, typeface, and measurement lives in `tailwind.config.js`. The custom "Card Catalog" theme is what stops this looking like a default admin panel. |
| Backend | Node + Express 5 | A standalone HTTP API with no knowledge of the web UI. A future mobile app can call the same endpoints without changing a line of it. |
| Auth | Neon Managed Better Auth | Required by the assignment. It issues a short-lived signed token that both our API and Postgres can verify independently. |
| Data access | Neon Data API | A REST layer over Postgres that carries the user's own token, so Row Level Security applies to every query. |
| Database | Neon Postgres | Required by the assignment. Row Level Security is the reason ownership is trustworthy. |
| Tests | Vitest + supertest | Fast, and runs the real Express app without needing a live database. |
| Hosting | Vercel | Required by the assignment. One deploy serves the static frontend and runs the API as a serverless function. |

### Why the frontend and backend are separate

The assignment could be satisfied by a browser talking straight to the Neon Data
API. This project deliberately does not do that. The browser talks to an Express
API, and only that API talks to the database.

That costs a little more work and buys two things:

1. **A trusted place to validate.** Anything running in a browser can be edited
   by the person using it. Validation only counts when it happens somewhere the
   user cannot reach.
2. **A reusable API.** `apps/api` imports nothing from `apps/web`. Pointing an
   iOS app at `/api/contacts` would require no backend changes at all.

---

## Architecture

```
   Browser — React + Vite
      │
      ├── sign up / sign in / sign out ─────────►  Neon Managed Better Auth
      │                                             issues a signed token
      │                                             that expires in 15 minutes
      │
      └── fetch /api/contacts
          Authorization: Bearer <token>
                │
                ▼
      Express API — apps/api
        1. verify the token's signature against Neon's public keys
        2. validate the payload, and strip any field the client
           should not be able to set
        3. forward that same user token onward
                │
                ▼
      Neon Data API — a REST layer over Postgres
                │
                ▼
      Neon Postgres
        Row Level Security filters every query to rows
        where user_id = auth.user_id()
```

### The request flow, in words

1. You sign in. Neon Auth gives the browser a **signed token** that says who you
   are. It is signed with a private key only Neon holds.
2. The browser asks our API for contacts, attaching that token.
3. The API **verifies the signature** using Neon's published public key. A forged
   token fails here, because forging one would require Neon's private key.
4. The API validates the request, then calls the Neon Data API **passing your
   token along unchanged**.
5. Postgres reads the token, so `auth.user_id()` returns your user ID, and the
   Row Level Security policies filter the query to your rows.

### The one architectural decision worth explaining

A backend can reach Neon Postgres two ways, and they have very different
security properties:

| Approach | What happens to Row Level Security |
| --- | --- |
| Connect directly with `DATABASE_URL` | The connection is the **database owner**, which **bypasses RLS entirely**. Ownership would rest solely on application code being bug-free. |
| **Call the Data API, forwarding the user's token** ← what this project does | Postgres sees the request as that specific user. **RLS enforces ownership inside the database.** |

The second approach means the database is the last line of defence. If the API
had a bug and asked for every row in the table, Postgres would still return only
the rows belonging to whoever made the request.

A fair question: what stops someone skipping our API and calling the Neon Data
API directly with their own token? Nothing — and that is fine. They would get
back exactly their own contacts, because RLS does not care which program sent
the query. That is precisely why the security lives in the database rather than
in the API.

---

## Local setup

**You need Node 20 or newer.** Check with `node --version`. If it is missing,
install the LTS build from [nodejs.org](https://nodejs.org).

```bash
git clone <your-repo-url>
cd networking-tracker
npm install
```

### Set up Neon

1. Create a free project at [neon.tech](https://neon.tech).
2. **Auth → Enable.** Open the **Configuration** tab and copy the **Auth URL**.
3. **Your database → Data API → Enable.** Choose **Use Managed Better Auth** as
   the JWT provider, and tick **Grant public schema access**. Copy the
   **Data API URL**.
4. Open the **SQL Editor** and run the contents of [`db/schema.sql`](db/schema.sql).
5. Go back to the **Data API** page and click **Refresh schema cache**.
   The Data API caches your table definitions, so a brand new table returns 404
   until you do this. It catches everybody once.

### Configure and run

```bash
cp .env.example .env.local
```

Paste your two URLs into `.env.local`, then:

```bash
npm run dev
```

This starts both halves at once — the Express API on port 3001 and the React app
on port 5173. Open **http://localhost:5173**.

In development, Vite proxies `/api` through to the Express server, which is
exactly how Vercel routes it in production. The frontend code is identical in
both places, and there is no CORS to configure.

### Every command

| Command | What it does |
| --- | --- |
| `npm run dev` | Run the API and the web app together |
| `npm run dev:api` | Just the Express API, on port 3001 |
| `npm run dev:web` | Just the React app, on port 5173 |
| `npm run build` | Build the production frontend into `apps/web/dist` |
| `npm test` | Run the whole test suite once |
| `npm run test:watch` | Re-run tests as you edit |

There is also a design preview at **http://localhost:5173/preview.html** — the
interface rendered with sample data, no sign-in and no database. It is excluded
from the production build.

---

## Environment variables

Copy `.env.example` to `.env.local` and fill in the real values.
`.env.local` is listed in `.gitignore` and is never committed.

| Variable | Visibility | What it is |
| --- | --- | --- |
| `VITE_NEON_AUTH_URL` | Public | Neon Managed Better Auth endpoint, used by the browser to sign in |
| `VITE_NEON_DATA_API_URL` | Public | Neon Data API endpoint |
| `NEON_AUTH_BASE_URL` | **Server only** | Used by the API to fetch Neon's public keys and verify tokens |
| `NEON_DATA_API_URL` | **Server only** | Where the API sends database requests |
| `PORT` | Server only | Local API port. Not needed in production. |

### On the two public variables

Anything prefixed `VITE_` is compiled into the JavaScript the browser downloads,
so treat it as public. That is safe here, and by design: these are public
endpoints, and a stranger holding both URLs with no valid session can read
nothing. Row Level Security is what protects the data, not the secrecy of a URL.

### A deliberate difference from the brief

The assignment lists `NEXT_PUBLIC_NEON_AUTH_URL`, `NEXT_PUBLIC_NEON_DATA_API_URL`,
`DATABASE_URL`, and `NEON_AUTH_COOKIE_SECRET`.

- The `NEXT_PUBLIC_` prefix is specific to Next.js. This project is React with
  Vite and a separate Express backend, so the equivalent prefix is `VITE_`. The
  variables serve exactly the same purpose.
- **`DATABASE_URL` and `NEON_AUTH_COOKIE_SECRET` are not used at all.** All
  database access goes through the Data API carrying the user's token, and
  sessions are managed by Neon rather than by our own cookies.

Not needing a Postgres connection string is a security improvement, not a gap: a
credential that never exists in the project cannot be committed, leaked, or
misused. It is also why nothing in this repository can bypass Row Level Security.

---

## Database schema

The full definition, with comments, is in [`db/schema.sql`](db/schema.sql).

### `contacts`

| Column | Type | Constraints | Purpose |
| --- | --- | --- | --- |
| `id` | `bigint` | primary key, generated | Row identifier |
| `user_id` | `text` | **not null, default `auth.user_id()`** | Who owns this card |
| `name` | `text` | not null, must not be blank | The person's name |
| `company` | `text` | max 200 chars | Where they work |
| `role` | `text` | max 200 chars | Their job title |
| `where_met` | `text` | max 200 chars | Where you met them |
| `notes` | `text` | max 5000 chars | What you talked about |
| `priority` | `text` | not null, **must be `high`, `medium`, or `low`** | How important the relationship is |
| `last_contacted_on` | `date` | optional, not in the future | When you last spoke |
| `cadence` | `text` | not null, one of `monthly`, `quarterly`, `annually`, `custom` | How often to reach out |
| `cadence_days` | `integer` | 1–3650, required only when cadence is `custom` | Custom interval length |
| `created_at` | `timestamptz` | not null, defaults to now | When the card was filed |
| `updated_at` | `timestamptz` | not null, maintained by a trigger | When it last changed |

### Two constraints worth pointing out

**`user_id` has a default, not an input.** The column defaults to
`auth.user_id()`, which returns the ID of whoever is making the request. The
browser never sends a `user_id` — the API strips the field if it is present, and
the database fills it in from the token. So there is no request you can craft
that files a card under someone else's name.

**`cadence_days` must agree with `cadence`.** A single constraint enforces that
a custom cadence has a day count and that every other cadence does not:

```sql
CHECK ((cadence = 'custom') = (cadence_days IS NOT NULL))
```

There is also a trigger that refreshes `updated_at` on every edit and forces
`user_id` back to its original value, so an update can never transfer ownership
even before the RLS policy is consulted.

---

## Authentication and ownership

### Signing in

Sign-up, sign-in, and sign-out all go through **Neon Managed Better Auth**. This
project never stores or even sees a password. Neon issues a signed token that
expires after about 15 minutes; the frontend requests a fresh one before each API
call rather than holding on to it.

### The ownership rule

Row Level Security is enabled on `contacts`, with a separate policy for each
operation. Every one of them compares the row's owner against the signed-in user:

```sql
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY contacts_select_own ON contacts
  FOR SELECT TO authenticated
  USING ( (select auth.user_id()) = user_id );

CREATE POLICY contacts_insert_own ON contacts
  FOR INSERT TO authenticated
  WITH CHECK ( (select auth.user_id()) = user_id );

CREATE POLICY contacts_update_own ON contacts
  FOR UPDATE TO authenticated
  USING      ( (select auth.user_id()) = user_id )
  WITH CHECK ( (select auth.user_id()) = user_id );

CREATE POLICY contacts_delete_own ON contacts
  FOR DELETE TO authenticated
  USING ( (select auth.user_id()) = user_id );
```

### `USING` versus `WITH CHECK`

These two clauses answer different questions, and the update policy needs both:

- **`USING`** — *which existing rows may I touch?* This is what stops you editing
  someone else's contact.
- **`WITH CHECK`** — *what is the row allowed to look like afterwards?* This is
  what stops you editing your own contact so that it belongs to somebody else.

With only `USING`, you could take a row you legitimately own and rewrite its
`user_id` to another person's. `WITH CHECK` re-tests the row after the change and
rejects it.

`SELECT` and `DELETE` only take `USING`, because neither writes a row. `INSERT`
only takes `WITH CHECK`, because there is no existing row to test.

### Why RLS matters more than the API

Enabling Row Level Security on a table means Postgres denies everything by
default, and only the policies above let anything through. The three states:

| State | Result |
| --- | --- |
| RLS disabled | Every authenticated user can read every row |
| RLS enabled, no policies | Nobody can read anything |
| RLS enabled with policies | Each user sees only their own rows |

Because the API forwards the user's own token rather than connecting as an admin,
these policies apply to every request the app makes. A bug in the API cannot leak
another user's contacts, because the database would refuse to return them.

### Validation happens three times

| Where | What it catches | Can a user bypass it? |
| --- | --- | --- |
| Browser (`shared/validate.js`) | Typos, before a round trip | **Yes** — anyone can edit their own browser |
| Express API (same module) | Everything, on a trusted server | No |
| Postgres `CHECK` constraints | Invalid priority, blank name, cadence mismatch | No |

The browser and the API run the *same* validation module, so the rules cannot
drift apart. The browser copy is a convenience; the two that count are the ones
the user cannot reach.

---

## Tests

```bash
npm test
```

### What is covered

**`tests/validate.test.js`** — the validation rules, as pure functions
- Empty, whitespace-only, missing, and over-long names are rejected
- Every valid priority is accepted; anything else is rejected
- A custom cadence without a day count is rejected
- Impossible dates (`2026-02-31`) and future dates are rejected
- `user_id`, `id`, and `created_at` are stripped from client input

**`tests/cadence.test.js`** — the follow-up maths
- Quarterly contact last spoken to 100 days ago → 9 days overdue
- Monthly contact last spoken to 28 days ago → due in 2 days
- Never contacted → surfaced as needing a first hello
- A custom 14-day cadence is honoured
- The 7-day boundary between "due this week" and "upcoming" is exact
- Each test passes a fixed date, so results never change with the calendar

**`tests/contacts.route.test.js`** — the real Express app, via HTTP
- A request with no token gets 401, and never reaches the database
- An empty name gets 400 with the message "Name is required."
- `priority: "urgent"` gets 400 and never reaches the database
- A `user_id` sent by the client is stripped before the database sees it
- Another user's contact returns 404, not 403
- An unrecognised sort column is ignored rather than passed through
- An unexpected server error returns a generic message, leaking no internals

Authentication and the database are replaced with test doubles here, so the suite
runs offline in under a second. Real signature verification and real Row Level
Security are proven separately by the two-account test below.

---

## Grading evidence

Everything below was run against the **deployed application**, not a local copy.

### Automated tests passing

```
$ npm test

 RUN  v5.0.0

 ✓ tests/cadence.test.js  (18 tests)
 ✓ tests/validate.test.js (31 tests)
 ✓ tests/contacts.route.test.js (28 tests)

 Test Files  3 passed (3)
      Tests  77 passed (77)
   Duration  402ms
```

### Invalid input fails safely

Both rejected by the deployed API, with a message a person can act on, and
neither reached the database:

```
$ curl -X POST https://<live-app>/api/contacts \
    -H "Authorization: Bearer <user A token>" \
    -d '{"name":"Bad","priority":"urgent"}'

{"error":"Invalid contact.",
 "message":"Priority must be one of: high, medium, low.",
 "fields":{"priority":"Priority must be one of: high, medium, low."}}   [400]
```

```
$ curl -X POST https://<live-app>/api/contacts \
    -H "Authorization: Bearer <user A token>" \
    -d '{"name":"   "}'

{"error":"Invalid contact.",
 "message":"Name is required.",
 "fields":{"name":"Name is required."}}                                [400]
```

### Ownership is stamped by the database

User A created a contact **without sending a `user_id`**. Postgres filled it in
from the token via the `auth.user_id()` column default:

```
$ curl -X POST https://<live-app>/api/contacts -H "Authorization: Bearer <A>" \
    -d '{"name":"Marcus Chen","company":"Zebra Technologies","priority":"high",
         "cadence":"quarterly","last_contacted_on":"2026-05-20"}'

{"contact":{"id":1,
            "user_id":"f0916764-b951-4826-9c75-f2b68b5c706d",   <- set by Postgres
            "name":"Marcus Chen", "priority":"high", ...}}       [201]
```

### Two accounts cannot see each other's contacts

Two accounts were created on the live site. User A filed contact `#1`. User B
then tried to reach it — first through the API, then **by skipping the API
entirely and querying the database directly with their own token**:

```
Through the Express API
  B lists their own contacts        → {"contacts":[]}          (A's row absent)
  B reads  /api/contacts/1          → 404
Directly against the Neon Data API, bypassing our backend
  B: GET /contacts?id=eq.1          → []
  B: GET /contacts?select=*         → []                       (full table scan)
Control
  A reads  /api/contacts/1          → 200                      (owner still fine)
```

The last two lines are the important ones. User B holds a valid token and is
talking straight to the database with no application code in the way — and
Postgres returns an empty set. Note that Row Level Security **filters** rather
than refusing: B does not get "403 forbidden", B gets "there is nothing here",
which is exactly right. It means ownership cannot leak even through a bug in the
API, because the API is not what enforces it.

### Authentication is required in production

```
$ curl https://<live-app>/api/contacts          # no token
{"error":"Not signed in.", ...}                                        [401]
```

### No secrets in the repository

```
$ git log -p --all | grep -icE 'postgres://|postgresql://|BEGIN .*PRIVATE KEY'
0
```

`.env.local` is gitignored and has never been committed. This project never uses
a Postgres connection string at all, so there is none to leak.

### Screenshots

_[optional: add screenshots of the drawer, the follow-up calendar, and sign-in]_

---

## Deployment

The whole project deploys as **one Vercel project**. The React app is built to
static files and served from the CDN; the Express API runs as a serverless
function at `/api`. `api/index.js` is the entire adapter — it imports the same
Express app used locally and hands it to Vercel.

1. **Push to GitHub.**

2. **Import the repository** at [vercel.com/new](https://vercel.com/new).
   `vercel.json` supplies the build command and output directory, so the defaults
   can be left alone.

3. **Add the environment variables** in Vercel under
   *Settings → Environment Variables*, for Production, Preview, and Development:
   `VITE_NEON_AUTH_URL`, `VITE_NEON_DATA_API_URL`, `NEON_AUTH_BASE_URL`, and
   `NEON_DATA_API_URL`. Do not add `DATABASE_URL` — this project has no use for one.

4. **Tell Neon Auth to trust your domain.** In the Neon Console under
   *Auth → Configuration → Domains*, add your deployed URL with the protocol and
   no trailing slash, e.g. `https://your-app.vercel.app`. Add
   `https://*.vercel.app` too if you want preview deployments to work.
   Any `localhost` port is already trusted.

5. **Lock down the Data API's allowed origins.** In the Neon Console under
   *Data API → Settings → CORS allowed origins*, list your domain explicitly.
   **Left empty, this setting allows every origin** — the default is permissive,
   not restrictive.

6. **Verify on the live URL** in a private browser window: sign up, add a
   contact, refresh, edit, delete, sign out. Then repeat the two-account test.

---

## Known limitations

Honest about what this does not do:

- **No password reset.** Neon Auth supports it; the interface is not built. A
  locked-out user currently needs a new account.
- **No email verification.** Anyone can sign up with any address. Fine for a
  private tracker, not for anything that emails people.
- **Deleting is permanent.** There is a confirmation prompt but no undo and no
  soft-delete, so a deleted card is genuinely gone.
- **Everything loads at once.** With a few thousand contacts the initial load
  would get slow. Real pagination would be the first fix.
- **Search and priority sorting happen in the browser**, over the contacts
  already loaded. At a larger scale both belong in the database query.
- **Cadence uses fixed day counts** — monthly is 30 days, quarterly 91, annually
  365 — rather than true calendar months. Simpler and more predictable, but
  "the first Monday of each month" is not expressible.
- **Neon Managed Better Auth and the Data API are both in Beta.** Their APIs may
  change.
- **Forwarding a user's token from a backend to the Data API is architecturally
  sound but not something Neon documents explicitly.** Their guidance frames the
  Data API as browser-facing. The behaviour follows directly from its
  bearer-token model, and the two-account test verifies it end to end.

### What I would build next

1. **Pagination and server-side search**, the two things that break first at scale.
2. **An interaction log** — one row per conversation instead of a single
   `last_contacted_on`, so you keep the history rather than overwriting it.
3. **Calendar export**, so follow-ups appear in Google Calendar.
4. **Undo for deletes**, using a `deleted_at` column and a policy that hides
   soft-deleted rows.
5. **A mobile app.** The API is already separate and has no dependency on the web
   frontend, so this needs no backend changes.
