// notify.js — schedules local notifications/alarms while the app is open,
// and re-registers them whenever roster data changes. See README for the
// honest limits of browser/PWA alarms vs. a native app.

import { db, getSetting, getUpcoming, todayISO, shiftDateTimes } from './db.js';

const timers = new Map(); // key -> timeout id
let audioCtx = null;

export async function requestPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'default') {
    return Notification.permission = await Notification.requestPermission();
  }
  return Notification.permission;
}

export function clearAllTimers() {
  for (const id of timers.values()) clearTimeout(id);
  timers.clear();
}

// Rebuild the schedule for the next N days based on current roster + alarm rules.
export async function rescheduleAll(days = 10) {
  clearAllTimers();
  const shiftTypes = Object.fromEntries((await db.shiftTypes.toArray()).map(s => [s.code, s]));
  const allRules = await db.alarmRules.toArray();
  const upcoming = await getUpcoming(todayISO(), days);
  const now = Date.now();

  for (const { date, entry } of upcoming) {
    if (!entry) continue;
    const st = shiftTypes[entry.code];
    if (!st) continue;
    const times = shiftDateTimes(entry, st);
    const shiftRules = allRules.filter(r => r.shiftCode === entry.code && r.enabled);
    for (const rule of shiftRules) {
      const fireAt = times ? times.start.getTime() - rule.minutesBefore * 60000
                            : new Date(`${date}T08:00:00`).getTime();
      const delay = fireAt - now;
      if (delay <= 0 || delay > days * 86400000) continue;
      const key = `${date}-${entry.code}-${rule.id}`;
      const id = setTimeout(() => fireAlert(rule, entry, st, date), delay);
      timers.set(key, id);
    }
  }

  // "Tomorrow" smart reminder + off-day notice, once per evening (20:00).
  const offDayNotify = await getSetting('offDayNotify');
  for (const { date, entry } of upcoming) {
    if (!entry) continue;
    const evening = new Date(`${date}T20:00:00`).getTime() - 86400000; // evening before
    const delay = evening - now;
    if (delay <= 0 || delay > days * 86400000) continue;
    if (entry.code === 'O' && !offDayNotify) continue;
    const st = shiftTypes[entry.code];
    const key = `tomorrow-${date}`;
    const id = setTimeout(() => fireAlert(
      { label: 'Tomorrow', type: 'notification' }, entry, st, date, true
    ), delay);
    timers.set(key, id);
  }
}

function fireAlert(rule, entry, shiftType, date, isTomorrowNotice = false) {
  const title = isTomorrowNotice
    ? `Tomorrow: ${shiftType.name}`
    : (rule.type === 'alarm' ? `⏰ ${rule.label}` : `🔔 ${rule.label}`);
  const body = isTomorrowNotice
    ? (shiftType.start ? `${shiftType.start} – ${shiftType.end}` : shiftType.name)
    : `${shiftType.name}${shiftType.start ? ' · ' + shiftType.start : ''}`;

  logNotification(title, body, date);
  showSystemNotification(title, body);
  if (rule.type === 'alarm') openAlarmModal(title, body, entry, shiftType);
}

async function logNotification(title, body, date) {
  await db.notificationLog.add({ scheduledFor: date, title, body, sentAt: new Date().toISOString() });
}

function showSystemNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(reg => reg.showNotification(title, { body, icon: 'icons/icon-192.png', tag: title }));
    } else {
      new Notification(title, { body, icon: 'icons/icon-192.png' });
    }
  }
}

function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, audioCtx.currentTime);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.4);
  } catch (e) { /* audio unavailable */ }
}

function openAlarmModal(title, body, entry, shiftType) {
  beep();
  const el = document.getElementById('alarm-modal');
  if (!el) return;
  el.querySelector('.alarm-title').textContent = title;
  el.querySelector('.alarm-body').textContent = body;
  el.classList.remove('hidden');
  el.querySelector('.snooze-btn').onclick = async () => {
    el.classList.add('hidden');
    const mins = Number(await getSetting('backupAlarmMinutes')) || 10;
    setTimeout(() => openAlarmModal(title, body, entry, shiftType), mins * 60000);
  };
  el.querySelector('.dismiss-btn').onclick = () => el.classList.add('hidden');
}

export async function getRecentNotifications(limit = 30) {
  return db.notificationLog.orderBy('scheduledFor').reverse().limit(limit).toArray();
}
