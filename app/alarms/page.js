'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting, setSetting } from '../../lib/db';
import { rescheduleAll, requestPermission, getRecentNotifications } from '../../lib/notify';

export default function AlarmsPage() {
  const [perm, setPerm] = useState('unsupported');
  const [backupEnabled, setBackupEnabled] = useState(false);
  const [backupMinutes, setBackupMinutes] = useState(10);
  const [recent, setRecent] = useState([]);

  const shiftTypes = useLiveQuery(() => (db ? db.shiftTypes.toArray() : []), [], []);
  const rules = useLiveQuery(() => (db ? db.alarmRules.toArray() : []), [], []);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) setPerm(Notification.permission);
    getSetting('backupAlarmEnabled').then(setBackupEnabled);
    getSetting('backupAlarmMinutes').then(setBackupMinutes);
    getRecentNotifications(10).then(setRecent);
  }, []);

  async function enableNotifications() {
    const p = await requestPermission();
    setPerm(p);
  }

  async function addRule(shiftCode) {
    await db.alarmRules.add({ shiftCode, label: 'Reminder', minutesBefore: 60, type: 'notification', enabled: true });
  }
  async function updateRule(id, patch) {
    await db.alarmRules.update(id, patch);
    await rescheduleAll();
  }
  async function deleteRule(id) {
    await db.alarmRules.delete(id);
  }

  return (
    <section className="page">
      <header className="page-head"><h1>Alarms &amp; notifications</h1></header>

      <div className={`perm-banner ${perm === 'granted' ? 'ok' : ''}`}>
        <p>Browser notifications: <strong>{perm}</strong></p>
        {perm !== 'granted' && <button className="btn btn-primary" onClick={enableNotifications}>Enable notifications</button>}
        <p className="muted-note">Best reliability comes from keeping this tab/app open and in your recent apps — see Settings for the full note on browser alarm limits.</p>
      </div>

      {shiftTypes.filter((s) => s.start).map((st) => (
        <div className="panel" key={st.code}>
          <h2>{st.icon} {st.name}</h2>
          <div className="rule-list">
            {rules.filter((r) => r.shiftCode === st.code).map((r) => (
              <div className="rule-row" key={r.id}>
                <span>{r.type === 'alarm' ? '⏰' : '🔔'}</span>
                <input value={r.label} onChange={(e) => updateRule(r.id, { label: e.target.value })} />
                <input type="number" min="0" value={r.minutesBefore} onChange={(e) => updateRule(r.id, { minutesBefore: Number(e.target.value) })} />
                <label className="switch">
                  <input type="checkbox" checked={r.enabled} onChange={(e) => updateRule(r.id, { enabled: e.target.checked })} />
                  <span />
                </label>
                <button className="rr-del" onClick={() => deleteRule(r.id)}>✕</button>
              </div>
            ))}
          </div>
          <button className="btn" onClick={() => addRule(st.code)}>+ Add reminder</button>
        </div>
      ))}

      <div className="panel">
        <h2>Backup alarm</h2>
        <label className="row-check">
          <input type="checkbox" checked={backupEnabled} onChange={async (e) => { setBackupEnabled(e.target.checked); await setSetting('backupAlarmEnabled', e.target.checked); }} />
          Repeat wake-up alarm if not dismissed
        </label>
        <label>Repeat every <input type="number" min="1" style={{ width: '3.8rem', display: 'inline-block' }} value={backupMinutes} onChange={async (e) => { setBackupMinutes(Number(e.target.value)); await setSetting('backupAlarmMinutes', Number(e.target.value)); }} /> minutes</label>
      </div>

      <div className="panel">
        <h2>Recent notifications</h2>
        {recent.length === 0 ? <p className="empty-note">Nothing sent yet.</p> : (
          <ul className="notif-log">
            {recent.map((n) => (
              <li key={n.id}><strong>{n.title}</strong><span>{n.body}</span><time>{new Date(n.sentAt).toLocaleString()}</time></li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
