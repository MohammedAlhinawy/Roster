# DutyRoster (Next.js)

A personal shift-roster app — Next.js 14 (App Router), vanilla CSS, IndexedDB
via Dexie for local-only storage. No backend, no account.

## Running it in VS Code

```bash
npm install
npm run dev
```

Open http://localhost:3000. Resize the browser to a phone width (or open
DevTools device toolbar) to see it as intended — it's built app-shaped, not
as a responsive website.

`npm run build && npm run start` builds and serves the production build.

## The app-shell layout

Every screen shares one fixed-height frame:

- **App bar** — `15dvh`. Shows the date/greeting on Home, the page title
  elsewhere, plus an avatar with your initials.
- **Body** — `67dvh`, scrollable. This is the only part that changes between
  pages, with a page-enter animation on every navigation.
- **Bottom nav** — `18dvh`, exactly 5 tabs (Home, Calendar, Roster, Alarms,
  Settings) with a sliding active-tab indicator. Import lives under Roster →
  Import rather than taking a 6th tab.

These proportions are CSS custom properties (`--appbar-h`, `--body-h`,
`--bottomnav-h`) at the top of `app/globals.css` if you want to tune them.

## Animations (all vanilla CSS, no animation library)

- Route changes fade/slide the body content in (`@keyframes pageEnter`), and
  use the native View Transitions API when the browser supports it (Chrome/
  Edge) for a cross-fade between screens — feature-detected, no-op elsewhere.
- The bottom-nav active tab is a sliding pill (`transform: translateX`).
- Modals slide up from the bottom with an opacity/transform transition.
- The dashboard "on duty" card has a slow pulsing glow; the alarm modal has a
  pulsing ring.
- List rows stagger in on the dashboard's 7-day view.

## The "which one is you?" roster picker

This is the main new feature. When you import a roster (Excel/CSV or a
photo/screenshot via OCR) that lists **many people** — one row per person,
one column per day — DutyRoster:

1. Detects the shape automatically (`lib/matrixParse.js`): a first column of
   names plus day-number or date columns.
2. Shows a picker of every name it found (or a "type your name" fallback if
   OCR misread it).
3. Pulls out only that person's row, asks which month it covers if the
   sheet only has day numbers, and hands it to the same review screen as any
   other import — nothing saves until you confirm.
4. Remembers your name in **Settings → Identity**, so the app bar shows your
   initials and the next multi-person import can offer the same name again.

A single-person export (`Date`, `Code` columns) skips the picker entirely.

## Where things live

```
app/
  layout.js          Root layout (fonts, metadata, wraps AppShell)
  globals.css         All styling — theme tokens, layout, animations
  page.js              Dashboard
  calendar/page.js
  roster/page.js
  roster/import/page.js   CSV/Excel + OCR import, multi-person handling
  alarms/page.js
  settings/page.js
components/
  AppShell.js          App bar + animated body + bottom nav, boot sequence
  AppBar.js / BottomNav.js
  Modal.js             Generic animated modal wrapper
  ModalHost.js          Mounts every modal once
  modals/*.js           Entry, bulk entry, person picker, alarm alert, onboarding
context/ModalContext.js  Open/close state for all modals
lib/
  db.js                Dexie schema + shift/date logic (night-shift-safe)
  notify.js             setTimeout-based alarm/notification engine
  matrixParse.js         CSV/Excel/OCR parsing incl. multi-person detection
```

## Data model notes

- `db.roster` — one row per date (`YYYY-MM-DD`), with a shift `code`.
- `db.shiftTypes` — M/N/O/L/S plus any custom codes you add in Settings.
- `db.alarmRules` — per-shift-type reminder rules (minutes-before + type).
- `db.settings` — key/value, includes `activePersonName` (who you are on a
  shared roster) and `lastImportPeople` (names seen in your last multi-person
  import, used by "Change identity" in Settings).

Everything is local to the browser's IndexedDB — there's no export/import
of it to a file yet in this version (the earlier plain-HTML build had a JSON
backup button in Settings; easy to port back in if you want it here too).

## Honest limits of browser alarms

Alarms are scheduled with `setTimeout` while the app is open, and
re-synced on focus and every 30 minutes. If the OS fully suspends the tab in
the background (common on iOS, and on some Android battery savers), a
scheduled alarm won't fire until you reopen the app — there's no push server
behind this. Treat it as a strong reminder layer, not a replacement for your
phone's native alarm for anything safety-critical.

## Extending

- Want this deployed too (not just local dev)? It's a standard Next.js app —
  Vercel works with zero config, or Netlify via the `@netlify/plugin-nextjs`
  build plugin (the previous plain-HTML build in this project's history is
  the simpler drag-and-drop-to-Netlify option if you don't need Next).
- OCR (`tesseract.js`) and Excel parsing (`xlsx`) are dynamically imported
  only when you use those features, so the main bundle stays small.
