// lib/sync.js — local-first sync between Dexie (source of truth for the UI)
// and Supabase, plus realtime. Last-write-wins on timestamps.
//
// All the cloud writes a device makes go through PostgREST normalised to the
// shared schema (public.shift_types / public.roster_entries /
// public.alarm_rules / public.user_settings / public.profiles). Files are
// NEVER uploaded — only parsed rows (date + shift code etc.) are synced.
'use client';

import { db, setSetting, setSyncInProgress } from './db';
import { supabase } from './supabase/client';
import { rescheduleAll } from './notify';

const SYNC_DEXIE_TABLES = new Set(['shiftTypes', 'roster', 'alarmRules']);

// user_settings keys that sync (lastImportPeople stays device-local).
const SYNC_SETTING_KEYS = [
  'timezone',
  'offDayNotify',
  'weeklySummary',
  'backupAlarmEnabled',
  'backupAlarmMinutes',
  'defaultPrep',
  'defaultTravel',
  'defaultBuffer',
];

let user = null;            // current signed-in user ({ id, email, ... })
let enabled = false;
let isSyncing = false;
let lastPulledAt = null;    // ms epoch
let lastSyncedAt = null;    // ms epoch
let retryTimer = null;
let debounceTimer = null;
let autoTimer = null;
let committedFn = null;
let onVisibility = null;
let realtimeCleanup = null;

const listeners = new Set();
function notify() {
  for (const fn of listeners) fn(getSyncStatusSync());
}

// ---- public status ---------------------------------------------------

export function getSyncStatusSync() {
  return {
    enabled,
    signedIn: !!user,
    syncing: isSyncing,
    lastSyncedAt,
    signedInAs: user?.email || null,
  };
}

export async function getSyncStatus() {
  const pending = await countPending();
  return { ...getSyncStatusSync(), pending };
}

export function subscribeSyncStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function countPending() {
  if (!db) return 0;
  const [a, b, c, d] = await Promise.all([
    db.shiftTypes.filter((r) => r.dirty).count(),
    db.roster.filter((r) => r.dirty).count(),
    db.alarmRules.filter((r) => r.dirty).count(),
    db.tombstones.count(),
  ]);
  return a + b + c + d;
}

// ---- lifecycle -------------------------------------------------------

export async function enableSync(nextUser) {
  if (!supabase || !nextUser) return;
  if (enabled && user?.id === nextUser.id) {
    requestSync();
    return;
  }
  user = nextUser;
  enabled = true;
  lastPulledAt = Number((await db.settings.get('sync.lastPulledAt'))?.value) || null;
  lastSyncedAt = Number((await db.settings.get('sync.lastSyncedAt'))?.value) || null;
  startAutoTriggers();
  startRealtime();
  notify();
  try { await syncNow(); } catch (e) { /* enableSync must not throw */ }
}

export function disableSync() {
  enabled = false;
  user = null;
  stopRealtime();
  stopAutoTriggers();
  clearTimeout(retryTimer);
  clearTimeout(debounceTimer);
  notify();
}

export function requestSync() {
  if (!enabled) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { syncNow().catch(() => {}); }, 1500);
}

export async function syncNow() {
  if (!enabled || !supabase || !user || isSyncing) return;
  isSyncing = true;
  notify();
  try {
    await pushAll();
    await pullAll();
    lastSyncedAt = Date.now();
    await setSetting('sync.lastSyncedAt', lastSyncedAt);
    notify();
  } catch (err) {
    console.error('[sync] failed, will retry later', err);
    if (enabled) {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => requestSync(), 30 * 1000);
    }
  } finally {
    isSyncing = false;
    notify();
  }
}

// Wrap Dexie writes that are driven by sync (clear dirty, apply pull, delete
// tombstones) so the write hooks in db.js don't re-stamp them dirty.
async function withHookBypass(fn) {
  setSyncInProgress(true);
  try { return await fn(); } finally { setSyncInProgress(false); }
}

// ---- push (local → cloud) --------------------------------------------

async function pushAll() {
  await pushShiftTypes();
  await pushRoster();
  await pushAlarmRules();
  await pushTombstones();
  await pushUserSettings();
  await pushProfile();
}

async function pushShiftTypes() {
  const rows = await db.shiftTypes.filter((r) => r.dirty).toArray();
  const errors = [];
  for (const r of rows) {
    const base = {
      user_id: user.id,
      code: r.code,
      name: r.name,
      start_time: r.start || null,
      end_time: r.end || null,
      crosses_midnight: !!r.crossesMidnight,
      color: r.color || '#8A8F9C',
      icon: r.icon || '*',
      is_system: !!r.system,
    };

    // LWW guard: don't overwrite a cloud row that is newer than this device.
    const { data: cloud } = await supabase
      .from('shift_types').select('updated_at').eq('user_id', user.id).eq('code', r.code).maybeSingle();
    if (cloud && new Date(cloud.updated_at).getTime() > (r.updatedAt || 0)) {
      await withHookBypass(() => db.shiftTypes.update(r.code, { dirty: false }));
      continue;
    }

    if (r.remoteId) base.id = r.remoteId;
    const { data, error } = await supabase
      .from('shift_types').upsert(base, { onConflict: 'user_id,code' }).select('id');
    if (error) { errors.push(error); continue; }
    await withHookBypass(() => db.shiftTypes.update(r.code, { dirty: false, remoteId: data?.[0]?.id || r.remoteId }));
  }
  if (errors.length) throw errors[0];
}

async function pushRoster() {
  const rows = await db.roster.filter((r) => r.dirty).toArray();
  const errors = [];
  for (const r of rows) {
    const payload = {
      user_id: user.id,
      duty_date: r.date,
      shift_code: r.code,
      start_time: r.start || null,
      end_time: r.end || null,
      location: r.location || null,
      notes: r.notes || null,
      source: r.source || 'manual',
    };

    // LWW guard (see pushShiftTypes).
    const { data: cloud } = await supabase
      .from('roster_entries').select('updated_at').eq('user_id', user.id).eq('duty_date', r.date).maybeSingle();
    if (cloud && new Date(cloud.updated_at).getTime() > (r.updatedAt || 0)) {
      await withHookBypass(() => db.roster.where('date').equals(r.date).modify({ dirty: false }));
      continue;
    }

    const { data, error } = await supabase
      .from('roster_entries').upsert(payload, { onConflict: 'user_id,duty_date' }).select('id, updated_at');
    if (error) { errors.push(error); continue; }
    const cloudMs = data?.[0]?.updated_at ? new Date(data[0].updated_at).getTime() : Date.now();
    await withHookBypass(() => db.roster.where('date').equals(r.date).modify({ dirty: false, updatedAt: cloudMs }));
  }
  if (errors.length) throw errors[0];
}

async function pushAlarmRules() {
  const rows = await db.alarmRules.filter((r) => r.dirty).toArray();
  const errors = [];
  for (const r of rows) {
    const payload = {
      user_id: user.id,
      shift_code: r.shiftCode,
      label: r.label,
      minutes_before: r.minutesBefore,
      kind: r.type === 'alarm' ? 'alarm' : 'notification',
      enabled: r.enabled,
    };
    if (!r.remoteId) {
      const { data, error } = await supabase.from('alarm_rules').insert(payload).select('id, updated_at').single();
      if (error) { errors.push(error); continue; }
      const cloudMs = data?.updated_at ? new Date(data.updated_at).getTime() : Date.now();
      await withHookBypass(() => db.alarmRules.update(r.id, { dirty: false, remoteId: data?.id, updatedAt: cloudMs }));
      continue;
    }

    // LWW guard (see pushShiftTypes).
    const { data: cloud } = await supabase.from('alarm_rules').select('updated_at').eq('id', r.remoteId).maybeSingle();
    if (cloud && new Date(cloud.updated_at).getTime() > (r.updatedAt || 0)) {
      await withHookBypass(() => db.alarmRules.update(r.id, { dirty: false }));
      continue;
    }

    payload.id = r.remoteId;
    const { error } = await supabase.from('alarm_rules').upsert(payload).select('id').single();
    if (error) { errors.push(error); continue; }
    await withHookBypass(() => db.alarmRules.update(r.id, { dirty: false }));
  }
  if (errors.length) throw errors[0];
}

async function pushTombstones() {
  const tombs = await db.tombstones.toArray();
  const errors = [];
  for (const t of tombs) {
    const iso = new Date().toISOString();
    try {
      if (t.table === 'roster') {
        const { data, error } = await supabase
          .from('roster_entries').select('id').eq('user_id', user.id).eq('duty_date', t.ref.duty_date).maybeSingle();
        if (error) throw error;
        if (data) {
          const r = await supabase.from('roster_entries').update({ deleted_at: iso }).eq('id', data.id);
          if (r.error) throw r.error;
        }
      } else if (t.table === 'alarm_rules') {
        if (t.ref.remoteId) {
          const r = await supabase.from('alarm_rules').update({ deleted_at: iso }).eq('id', t.ref.remoteId).eq('user_id', user.id);
          if (r.error) throw r.error;
        }
      } else if (t.table === 'shift_types') {
        const { data, error } = await supabase
          .from('shift_types').select('id').eq('user_id', user.id).eq('code', t.ref.code).maybeSingle();
        if (error) throw error;
        if (data) {
          const r = await supabase.from('shift_types').update({ deleted_at: iso }).eq('id', data.id);
          if (r.error) throw r.error;
        }
      }
      await withHookBypass(() => db.tombstones.delete(t.id));
    } catch (err) {
      errors.push(err);
    }
  }
  if (errors.length) throw errors[0];
}

async function pushUserSettings() {
  const errors = [];
  for (const key of SYNC_SETTING_KEYS) {
    const row = await db.settings.get(key);
    if (!row || row.value == null) continue;
    const { error } = await supabase
      .from('user_settings').upsert(
        { user_id: user.id, key, value: row.value },
        { onConflict: 'user_id,key' }
      );
    if (error) errors.push(error);
  }
  if (errors.length) throw errors[0];
}

async function pushProfile() {
  const row = await db.settings.get('activePersonName');
  if (!row?.value) return;
  const { error } = await supabase
    .from('profiles').update({ roster_name: row.value }).eq('id', user.id);
  if (error) throw error;
}

// ---- pull (cloud → local) --------------------------------------------

async function pullAll() {
  await pullShiftTypes();
  const rosterChanged = await pullRoster();
  const rulesChanged = await pullAlarmRules();
  await pullUserSettings();
  await pullProfile();

  lastPulledAt = Date.now();
  await setSetting('sync.lastPulledAt', lastPulledAt);

  if (rosterChanged || rulesChanged) {
    await rescheduleAll();
  }
}

const cursorQuery = (q) =>
  lastPulledAt ? q.gt('updated_at', new Date(lastPulledAt).toISOString()) : q;

async function pullShiftTypes() {
  let q = supabase.from('shift_types').select('*').eq('user_id', user.id);
  q = cursorQuery(q);
  const { data, error } = await q;
  if (error) throw error;
  await withHookBypass(async () => {
    for (const row of data || []) {
      const cloudMs = new Date(row.updated_at).getTime();
      const local = await db.shiftTypes.get(row.code);
      if (row.deleted_at) {
        if (local && !local.system) await db.shiftTypes.delete(row.code);
        continue;
      }
      if (local && typeof local.updatedAt === 'number' && local.updatedAt > cloudMs) continue;
      await db.shiftTypes.put({
        code: row.code,
        name: row.name,
        start: row.start_time || null,
        end: row.end_time || null,
        crossesMidnight: row.crosses_midnight,
        color: row.color,
        icon: row.icon,
        system: row.is_system,
        updatedAt: cloudMs,
        dirty: false,
        remoteId: row.id,
      });
    }
  });
}

async function pullRoster() {
  let q = supabase.from('roster_entries').select('*').eq('user_id', user.id);
  q = cursorQuery(q);
  const { data, error } = await q;
  if (error) throw error;
  let changed = false;
  await withHookBypass(async () => {
    for (const row of data || []) {
      const cloudMs = new Date(row.updated_at).getTime();
      const local = await db.roster.where('date').equals(row.duty_date).first();
      if (row.deleted_at) {
        if (local) { await db.roster.where('date').equals(row.duty_date).delete(); changed = true; }
        continue;
      }
      if (local && typeof local.updatedAt === 'number' && local.updatedAt > cloudMs) continue;
      const record = {
        date: row.duty_date,
        code: row.shift_code,
        start: row.start_time || null,
        end: row.end_time || null,
        location: row.location || null,
        notes: row.notes || null,
        source: row.source || 'manual',
        updatedAt: cloudMs,
        dirty: false,
      };
      if (local) {
        const sameness = (v) => JSON.stringify([v.code, v.start, v.end, v.location, v.notes]);
        if (sameness(record) !== sameness(local)) changed = true;
        await db.roster.where('date').equals(row.duty_date).modify(record);
      } else {
        await db.roster.add(record);
        changed = true;
      }
    }
  });
  return changed;
}

async function pullAlarmRules() {
  let q = supabase.from('alarm_rules').select('*').eq('user_id', user.id);
  q = cursorQuery(q);
  const { data, error } = await q;
  if (error) throw error;
  let changed = false;
  await withHookBypass(async () => {
    const existing = await db.alarmRules.toArray();
    const byRemote = new Map(existing.filter((r) => r.remoteId).map((r) => [r.remoteId, r]));
    for (const row of data || []) {
      const cloudMs = new Date(row.updated_at).getTime();
      const local = byRemote.get(row.id);
      if (row.deleted_at) {
        if (local) { await db.alarmRules.delete(local.id); changed = true; }
        continue;
      }
      if (local) {
        if (typeof local.updatedAt === 'number' && local.updatedAt > cloudMs) continue;
        await db.alarmRules.update(local.id, {
          shiftCode: row.shift_code,
          label: row.label,
          minutesBefore: row.minutes_before,
          type: row.kind === 'alarm' ? 'alarm' : 'notification',
          enabled: row.enabled,
          updatedAt: cloudMs,
          dirty: false,
        });
      } else {
        await db.alarmRules.add({
          shiftCode: row.shift_code,
          label: row.label,
          minutesBefore: row.minutes_before,
          type: row.kind === 'alarm' ? 'alarm' : 'notification',
          enabled: row.enabled,
          remoteId: row.id,
          updatedAt: cloudMs,
          dirty: false,
        });
        changed = true;
      }
    }
  });
  return changed;
}

async function pullUserSettings() {
  let q = supabase.from('user_settings').select('*').eq('user_id', user.id);
  q = cursorQuery(q);
  const { data, error } = await q;
  if (error) throw error;
  await withHookBypass(async () => {
    for (const row of data || []) {
      const cloudMs = new Date(row.updated_at).getTime();
      const local = await db.settings.get(row.key);
      const localMs = typeof local?.ts === 'number' ? local.ts : 0;
      if (localMs > cloudMs) continue;
      await db.settings.put({ key: row.key, value: row.value, ts: cloudMs });
    }
  });
}

async function pullProfile() {
  const { data: profile, error } = await supabase
    .from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  if (profile?.roster_name) {
    const local = await db.settings.get('activePersonName');
    if (!local?.value) await setSetting('activePersonName', profile.roster_name);
  }
}

// ---- deletions (soft-delete remote, tombstone local) -----------------

export async function removeRoster(date) {
  if (!db) return;
  await db.roster.where('date').equals(date).delete();
  await db.tombstones.add({ table: 'roster', ref: { duty_date: date }, updatedAt: Date.now() });
  requestSync();
  await rescheduleAll();
}

export async function removeAlarmRule(rule) {
  if (!db) return;
  const remoteId = rule?.remoteId;
  await db.alarmRules.delete(rule.id);
  if (remoteId) await db.tombstones.add({ table: 'alarm_rules', ref: { remoteId }, updatedAt: Date.now() });
  requestSync();
  await rescheduleAll();
}

// ---- identity --------------------------------------------------------

export async function setIdentity(name) {
  if (!db) return;
  await db.settings.put({ key: 'activePersonName', value: name });
  if (enabled && user) {
    const { error } = await supabase.from('profiles').update({ roster_name: name }).eq('id', user.id);
    if (!error) requestSync();
  }
}

// ---- realtime --------------------------------------------------------

function startRealtime() {
  stopRealtime();
  const channel = supabase
    .channel('dutyroster-db')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'roster_entries', filter: `user_id=eq.${user.id}` }, () => requestSync())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'alarm_rules', filter: `user_id=eq.${user.id}` }, () => requestSync())
    .subscribe();
  realtimeCleanup = () => { supabase.removeChannel(channel); };
}

function stopRealtime() {
  if (realtimeCleanup) { realtimeCleanup(); realtimeCleanup = null; }
}

// ---- auto triggers ---------------------------------------------------

function startAutoTriggers() {
  if (!db || committedFn) return;
  committedFn = (changes) => {
    if (isSyncing) return;
    if (changes.some((c) => SYNC_DEXIE_TABLES.has(c.table))) requestSync();
  };
  db.on('committed').subscribe(committedFn);
  onVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') requestSync();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
  autoTimer = setInterval(() => requestSync(), 5 * 60 * 1000);
}

function stopAutoTriggers() {
  if (!db) return;
  if (committedFn) { db.on('committed').unsubscribe(committedFn); committedFn = null; }
  if (onVisibility && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
  onVisibility = null;
  clearInterval(autoTimer);
  autoTimer = null;
}