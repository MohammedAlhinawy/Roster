# DutyRoster (Next.js)

A personal shift-roster app — Next.js (App Router), vanilla CSS, local-first
sync. Dexie/IndexedDB is the source of truth the UI reads from; Supabase is
the sync target so the same account works on the web app and the (separate)
React Native app. Everything still works fully offline and without an account.

## Running it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Resize the browser to a phone width (or open
DevTools device toolbar) to see it as intended — it's built app-shaped.

## Supabase setup

1. Create a project at https://supabase.com.
2. Open **SQL Editor**, paste `supabase/schema.sql`, run it. It creates
   `profiles`, `shift_types`, `roster_entries`, `alarm_rules`,
   `user_settings`, `devices` — all with owner-only RLS, `updated_at`
   triggers, soft deletes (`deleted_at`), and a trigger that seeds default
   shift types + alarm rules on signup.
3. Copy `.env.local.example` to `.env.local` and fill in
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (found in
   Dashboard → Project Settings → API). **Never commit real keys; never put
   the service-role key in the browser bundle.**

The app additionally runs **without** any of this in plain local-only mode.

## How sync works

Local-first, last-write-wins on `updated_at`:

- **Dexie is the UI's source of truth.** Every write to a synced table
  (`shiftTypes`, `roster`, `alarmRules`) is stamped `dirty` + `updatedAt` by
  IndexedDB hooks (`lib/db.js`).
- **Push**: `lib/sync.js` upserts dirty rows to Supabase and clears the flag.
- **Pull**: rows changed since the stored `lastPulledAt` cursor are fetched;
  newer rows overwrite local ones (LWW), cloud soft-deletes remove local ones.
- **Deletes** become tombstones → the remote row gets `deleted_at`.
- **Realtime**: Postgres changes on `roster_entries` + `alarm_rules` trigger a
  pull, which calls `rescheduleAll()` — an alarm changed on your phone re-times
  the web alarms.
- Sync runs on sign-in, app focus, any data mutation, and a periodic timer.
  Offline failures are queued and retried; sync never blocks the UI.

## Accounts, local-only mode, and privacy

- Email + password sign-in/sign-up at `/login` and `/signup`. A signed-out
  visitor can choose **"Use without an account"** and everything runs
  locally-only; a small banner offers sign-in for sync.
- `profiles.roster_name` is the synced version of Settings → Identity.
  `lastImportPeople` stays device-local (it can contain colleagues' names).

### Files are never uploaded

Roster photos, screenshots, PDFs, `.xlsx`, `.csv` — all of it stays **on the
device**. OCR (`tesseract.js`), spreadsheet (`xlsx`) and CSV (`papaparse`)
parsing happen client-side, and only the **parsed rows** (date + shift code)
are ever written to your account. When you pick your name on a shared roster,
everyone else's rows are discarded before anything is saved.

## The app shell & animations

Read the original notes: a fixed 15/75/10 `dvh` frame (app bar / body / bottom
nav), vanilla-CSS page-enter + View Transitions, sliding tab pill, pulsing
hero/alarm card. — `app/globals.css` holds the `--appbar-h`/`--body-h`/
`--bottomnav-h` tokens.

## Where things live

```
app/                  pages (dashboard, calendar, roster, import, alarms, settings, login, signup)
components/           AppShell, AppBar, BottomNav, Modal*, modals/*, SyncEngine, AuthBanner
context/              ModalContext, AuthContext
lib/
  db.js               Dexie schema (v2: dirty/updatedAt/tombstones), night-shift-safe date logic
  sync.js             local-first sync engine + realtime + identity helpers
  syncHooks.js        useSyncStatus() for the Settings panel
  notify.js           setTimeout alarm/notification engine (kept — push is optional later)
  matrixParse.js      CSV/Excel/OCR parsing incl. multi-person detection
  supabase/client.js  browser Supabase client
  supabase/server.js  SSR cookie client (@supabase/ssr)
proxy.js            session refresh + signed-out redirect to /login (Next 16 proxy convention)
supabase/schema.sql   shared schema, applied once via SQL Editor
```

## Data model notes

- `db.roster` — one row per date (`YYYY-MM-DD`) + shift `code`. Each row also
  carries sync fields (`dirty`, `updatedAt`) stamped automatically.
- `db.shiftTypes` — M/N/O/L/S + custom codes; `db.alarmRules` — per-shift
  reminders; `db.settings` — key/value (synced user settings + device-local
  keys like `lastImportPeople`); `db.notificationLog` — never synced (a fired
  notification is a device-local event).
- Add/update/delete any roster line and alarms reschedule automatically.

## Honest limits of browser alarms

Alarms are scheduled with `setTimeout` while the app is open and re-synced on
focus and every 30 minutes. If the OS fully suspends the tab, an alarm won't
fire until the app reopens — no push server behind it yet. Treat it as a
strong reminder layer, not a replacement for a native alarm for anything
safety-critical. (Web push is a planned, optional addition via the `devices`
table.)

## Deploying

This is a server-rendered Next.js app (auth middleware + cookies), **not** a
static export site:

- **Vercel** — zero config, works out of the box.
- **Netlify** — the `netlify.toml` in the repo uses the official
  `@netlify/plugin-nextjs`. Add the two `NEXT_PUBLIC_SUPABASE_*` env vars in
  the dashboard.