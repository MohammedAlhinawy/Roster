# DutyRoster

A personal shift-roster app: enter or import your roster (M/N/O/L/S), see
today's duty and what's next, and get reminders/alarms before each shift.
Runs entirely in your browser — there is no server and no account. All data
is stored on-device in IndexedDB.

## Deploying to Netlify

This is a static site — no build step.

1. Drag the whole `dutyroster` folder onto [app.netlify.com/drop](https://app.netlify.com/drop), **or**
2. Push this folder to a GitHub repo and connect it in Netlify with:
   - Build command: *(leave blank)*
   - Publish directory: `.`

That's it — `netlify.toml` is already set up.

## Using it as an "app"

- **Android / desktop Chrome/Edge:** open the site, go to **Settings → Install
  app**, or use the browser's own "Install app" menu option. It opens
  full-screen, gets its own icon, and works offline.
- **iPhone (Safari):** open the site in Safari → Share button → **Add to Home
  Screen**. iOS doesn't show a JavaScript install prompt, so this is the only
  path there.

## What's included

- **Dashboard** — today's status (handles night shifts crossing midnight
  correctly), next duty, next off day, next 7 days.
- **Calendar** — month view, tap a day to add/edit.
- **Roster** — list view, single-entry form, and bulk month entry (paste a
  row of codes like `M M O N N O ...`).
- **Import** — Excel/CSV upload (`Date`, `Code` columns) and photo/screenshot
  OCR (reads day-number + code pairs from an image using Tesseract.js,
  entirely on-device). Both show a **review screen** before anything is
  saved, so bad reads never silently corrupt your roster.
- **Alarms & notifications** — per-shift-type reminder rules (e.g. wake-up
  90 minutes before a Morning shift, leave-home reminder, shift-start
  notice), a repeating "backup alarm" option, and a notification history.
- **Settings** — editable shift types/colours/times, custom shift codes,
  timezone, JSON backup export/import, and full data wipe.

## Honest limits of browser-based alarms

This app is built to be as reliable as a website can be, but it is **not**
the same as a native phone alarm, and you should know the difference:

- Alarms are scheduled by the page itself (`setTimeout`), rechecked every
  time the app regains focus, and re-synced every 30 minutes while open.
  If the browser/OS fully kills the tab or the installed PWA in the
  background (common on iOS, and on some Android battery-saver modes),
  a scheduled alarm **will not fire** until you reopen the app.
- There is no push server behind this app, so there's no way to wake the
  device from a fully closed state the way a native alarm clock can.
- For best reliability: install it to your home screen, leave notification
  permission granted, and keep the app in your recent-apps list rather than
  force-closing it. On Android this is generally reliable; on iOS, Safari's
  background limits mean you should treat DutyRoster as a strong reminder
  system, not a substitute for your phone's built-in alarm for anything
  safety-critical.
- If you outgrow this later, the architecture is intentionally simple to
  hand off to a native shell (e.g. Capacitor/React Native) for guaranteed
  background alarms — the roster/alarm-rule data model here would carry
  over directly.

## Data & backups

Everything lives in this browser's IndexedDB. Clearing site data/browser
data deletes it. Use **Settings → Export backup** regularly (it's a small
JSON file) and **Import backup** to restore or move to a new device/browser.

## Project structure

```
index.html         App shell, nav, modals
css/style.css       Styling
js/db.js            IndexedDB schema + shift/date logic (night-shift-safe)
js/notify.js        Alarm/notification scheduling engine
js/app.js           Router + bootstrap
js/render/*.js       One file per screen
vendor/*.js          Dexie, PapaParse, SheetJS, Tesseract.js (bundled, no CDN dependency for the core app)
sw.js               Service worker (offline app-shell caching)
manifest.json       PWA manifest
netlify.toml        Netlify config
```
