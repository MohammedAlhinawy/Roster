// lib/db.js — local IndexedDB (Dexie). Guarded so it's safe to import from
// Server-rendered "use client" components: on the server `db` is null and
// every helper below simply no-ops until it runs in the browser.
'use client';

import Dexie from 'dexie';

export const db = typeof window !== 'undefined' ? new Dexie('dutyroster') : null;

// True while the sync engine writes pulled rows into Dexie — lets the write
// hooks below skip stamping `dirty`/`updatedAt` on rows that come FROM the
// cloud (they already carry the server's timestamps).
export let syncInProgress = false;
export function setSyncInProgress(v) { syncInProgress = v; }

if (db) {
  db.version(1).stores({
    shiftTypes: 'code',
    roster: '++id, date',
    alarmRules: '++id, shiftCode',
    settings: 'key',
    notificationLog: '++id, scheduledFor',
  });

  // v2: sync plumbing. No index changes to existing tables (their data
  // survives untouched); we add the tombstones table and backfill the new
  // dirty/updatedAt fields on whatever already exists (existing rows are
  // marked dirty so a first sign-in pushes them up).
  db.version(2).stores({
    shiftTypes: 'code',
    roster: '++id, date, updatedAt',
    alarmRules: '++id, shiftCode, updatedAt',
    settings: 'key',
    notificationLog: '++id, scheduledFor',
    tombstones: '++id, table, updatedAt',
  }).upgrade((tx) => {
    const mark = (r) => { if (typeof r.updatedAt !== 'number') { r.updatedAt = Date.now(); r.dirty = true; } };
    return Promise.all([
      tx.table('shiftTypes').toCollection().modify(mark),
      tx.table('roster').toCollection().modify(mark),
      tx.table('alarmRules').toCollection().modify(mark),
    ]);
  });

  // Every local write to a synced table is stamped dirty + updatedAt.
  // Rows applied during a pull are exempt (they are already consistent).
  const SYNC_TABLES = new Set(['shiftTypes', 'roster', 'alarmRules']);
  for (const tableName of SYNC_TABLES) {
    const table = db[tableName];
    if (!table) continue;
    table.hook('creating', (primKey, obj) => {
      if (!syncInProgress) { obj.updatedAt = Date.now(); obj.dirty = true; }
    });
    table.hook('updating', (mods, primKey) => {
      if (!syncInProgress) { mods.updatedAt = Date.now(); mods.dirty = true; }
    });
  }

  // user_settings rely on a local write timestamp for LWW reconciliation.
  db.settings.hook('creating', (primKey, obj) => {
    if (!syncInProgress && typeof obj.ts !== 'number') obj.ts = Date.now();
  });
  db.settings.hook('updating', (mods, primKey) => {
    if (!syncInProgress && typeof mods.ts !== 'number') mods.ts = Date.now();
  });
}

export const DEFAULT_SHIFT_TYPES = [
  { code: 'M', name: 'Morning Shift', start: '08:00', end: '18:00', crossesMidnight: false, color: '#E8A33D', icon: '🟢', system: true },
  { code: 'N', name: 'Night Shift', start: '18:00', end: '08:00', crossesMidnight: true, color: '#5B7FE0', icon: '🌙', system: true },
  { code: 'O', name: 'Off Day', start: null, end: null, crossesMidnight: false, color: '#4C9A6A', icon: '⚪', system: true },
  { code: 'L', name: 'Leave', start: null, end: null, crossesMidnight: false, color: '#C9A6E8', icon: '🏖️', system: true },
  { code: 'S', name: 'Work Assignment', start: '08:00', end: '17:00', crossesMidnight: false, color: '#4AAFAE', icon: '📍', system: true },
];

export const DEFAULT_SETTINGS = {
  timezone: 'Africa/Dar_es_Salaam',
  userName: '',
  activePersonName: '',
  onboarded: false,
  offDayNotify: true,
  weeklySummary: true,
  backupAlarmEnabled: false,
  backupAlarmMinutes: 10,
  defaultPrep: 45,
  defaultTravel: 30,
  defaultBuffer: 15,
  lastImportPeople: [],
};

export async function ensureSeeded() {
  if (!db) return;
  const count = await db.shiftTypes.count();
  if (count === 0) await db.shiftTypes.bulkPut(DEFAULT_SHIFT_TYPES);

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const existing = await db.settings.get(key);
    if (!existing) await db.settings.put({ key, value });
  }

  const ruleCount = await db.alarmRules.count();
  if (ruleCount === 0) {
    await db.alarmRules.bulkAdd([
      { shiftCode: 'M', label: 'Wake-up alarm', minutesBefore: 90, type: 'alarm', enabled: true },
      { shiftCode: 'M', label: 'Leave-home reminder', minutesBefore: 30, type: 'notification', enabled: true },
      { shiftCode: 'M', label: 'Shift starts', minutesBefore: 0, type: 'notification', enabled: true },
      { shiftCode: 'N', label: 'Wake-up alarm', minutesBefore: 120, type: 'alarm', enabled: true },
      { shiftCode: 'N', label: 'Leave-home reminder', minutesBefore: 30, type: 'notification', enabled: true },
      { shiftCode: 'N', label: 'Shift starts', minutesBefore: 0, type: 'notification', enabled: true },
    ]);
  }
}

export async function getSetting(key) {
  if (!db) return DEFAULT_SETTINGS[key];
  const row = await db.settings.get(key);
  return row ? row.value : DEFAULT_SETTINGS[key];
}
export async function setSetting(key, value) {
  if (!db) return;
  await db.settings.put({ key, value });
}

// ---- date helpers ----
export function pad(n) { return String(n).padStart(2, '0'); }
export function toISODate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function todayISO() { return toISODate(new Date()); }
export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISODate(d);
}
export function weekday(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
}
export function dayLabel(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

// A shift entry occupies [start, end). Night shifts cross midnight, so
// "today's" duty must also check whether yesterday's night shift is still running.
export function shiftDateTimes(entry, shiftType) {
  if (!shiftType || !shiftType.start || !shiftType.end) return null;
  const start = new Date(`${entry.date}T${entry.start || shiftType.start}:00`);
  let end = new Date(`${entry.date}T${entry.end || shiftType.end}:00`);
  if (shiftType.crossesMidnight || end <= start) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }
  return { start, end };
}

export async function getActiveEntry(at = new Date()) {
  if (!db) return null;
  const iso = toISODate(at);
  const yIso = addDays(iso, -1);
  const candidates = await db.roster.where('date').anyOf([yIso, iso]).toArray();
  const shiftTypes = await db.shiftTypes.toArray();
  const byCode = Object.fromEntries(shiftTypes.map((s) => [s.code, s]));
  for (const entry of candidates) {
    const st = byCode[entry.code];
    if (!st) continue;
    const times = shiftDateTimes(entry, st);
    if (times && at >= times.start && at < times.end) return { entry, shiftType: st, times };
  }
  return null;
}

export async function getUpcoming(fromIso, days) {
  if (!db) return [];
  const dates = Array.from({ length: days }, (_, i) => addDays(fromIso, i));
  const rows = await db.roster.where('date').anyOf(dates).toArray();
  const byDate = Object.fromEntries(rows.map((r) => [r.date, r]));
  return dates.map((d) => ({ date: d, entry: byDate[d] || null }));
}
