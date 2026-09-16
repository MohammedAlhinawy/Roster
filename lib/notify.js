// lib/notify.js — schedules local notifications/alarms while the app is open.
// This is a plain imperative module (not a component) because setTimeout-based
// scheduling doesn't need React; it registers a callback so the alarm modal
// (a React component) can still be triggered when an alarm fires.
'use client';

import { db, getSetting, getUpcoming, todayISO, shiftDateTimes } from './db';

const timers = new Map();
let audioCtx = null;
let alarmHandler = null; // (title, body) => void, set by <AppShell>

export function setAlarmHandler(fn) {
  alarmHandler = fn;
}

export async function requestPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'default') {
    return await Notification.requestPermission();
  }
  return Notification.permission;
}

export function clearAllTimers() {
  for (const id of timers.values()) clearTimeout(id);
  timers.clear();
}

export async function rescheduleAll(days = 10) {
  if (!db) return;
  clearAllTimers();
  const shiftTypes = Object.fromEntries((await db.shiftTypes.toArray()).map((s) => [s.code, s]));
  const allRules = await db.alarmRules.toArray();
  const upcoming = await getUpcoming(todayISO(), days);
  const now = Date.now();

  for (const { date, entry } of upcoming) {
    if (!entry) continue;
    const st = shiftTypes[entry.code];
    if (!st) continue;
    const times = shiftDateTimes(entry, st);
    const shiftRules = allRules.filter((r) => r.shiftCode === entry.code && r.enabled);
    for (const rule of shiftRules) {
      const fireAt = times ? times.start.getTime() - rule.minutesBefore * 60000 : new Date(`${date}T08:00:00`).getTime();
      const delay = fireAt - now;
      if (delay <= 0 || delay > days * 86400000) continue;
      const key = `${date}-${entry.code}-${rule.id}`;
      const id = setTimeout(() => fireAlert(rule, entry, st, date), delay);
      timers.set(key, id);
    }
  }

  const offDayNotify = await getSetting('offDayNotify');
  for (const { date, entry } of upcoming) {
    if (!entry) continue;
    const evening = new Date(`${date}T20:00:00`).getTime() - 86400000;
    const delay = evening - now;
    if (delay <= 0 || delay > days * 86400000) continue;
    if (entry.code === 'O' && !offDayNotify) continue;
    const st = shiftTypes[entry.code];
    const key = `tomorrow-${date}`;
    const id = setTimeout(() => fireAlert({ label: 'Tomorrow', type: 'notification' }, entry, st, date, true), delay);
    timers.set(key, id);
  }
}

function fireAlert(rule, entry, shiftType, date, isTomorrowNotice = false) {
  const title = isTomorrowNotice ? `Tomorrow: ${shiftType.name}` : rule.type === 'alarm' ? `⏰ ${rule.label}` : `🔔 ${rule.label}`;
  const body = isTomorrowNotice
    ? shiftType.start
      ? `${shiftType.start} – ${shiftType.end}`
      : shiftType.name
    : `${shiftType.name}${shiftType.start ? ' · ' + shiftType.start : ''}`;

  logNotification(title, body, date);
  showSystemNotification(title, body);
  if (rule.type === 'alarm') {
    beep();
    alarmHandler?.(title, body);
  }
}

async function logNotification(title, body, date) {
  if (!db) return;
  await db.notificationLog.add({ scheduledFor: date, title, body, sentAt: new Date().toISOString() });
}

function showSystemNotification(title, body) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

function beep() {
  if (typeof window === 'undefined') return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, audioCtx.currentTime);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.4);
  } catch (e) {
    /* audio unavailable */
  }
}

export async function getRecentNotifications(limit = 30) {
  if (!db) return [];
  return db.notificationLog.orderBy('scheduledFor').reverse().limit(limit).toArray();
}
