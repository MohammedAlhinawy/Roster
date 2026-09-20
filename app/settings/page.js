'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting, setSetting } from '../../lib/db';
import { rescheduleAll } from '../../lib/notify';
import { useModal } from '../../context/ModalContext';
import { useAuth } from '../../context/AuthContext';
import { setIdentity, syncNow } from '../../lib/sync';
import { useSyncStatus } from '../../lib/syncHooks';

export default function SettingsPage() {
  const { openPersonPicker } = useModal();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const syncStatus = useSyncStatus();
  const shiftTypes = useLiveQuery(() => (db ? db.shiftTypes.toArray() : []), [], []);

  const [userName, setUserName] = useState('');
  const [activePersonName, setActivePersonName] = useState('');
  const [lastImportPeople, setLastImportPeople] = useState([]);
  const [timezone, setTimezone] = useState('');
  const [weeklySummary, setWeeklySummary] = useState(true);
  const [offDayNotify, setOffDayNotify] = useState(true);
  const [prep, setPrep] = useState(45);
  const [travel, setTravel] = useState(30);
  const [buffer, setBuffer] = useState(15);

  useEffect(() => {
    (async () => {
      setUserName(await getSetting('userName'));
      setActivePersonName(await getSetting('activePersonName'));
      setLastImportPeople(await getSetting('lastImportPeople'));
      setTimezone(await getSetting('timezone'));
      setWeeklySummary(await getSetting('weeklySummary'));
      setOffDayNotify(await getSetting('offDayNotify'));
      setPrep(await getSetting('defaultPrep'));
      setTravel(await getSetting('defaultTravel'));
      setBuffer(await getSetting('defaultBuffer'));
    })();
  }, []);

  function changeIdentity() {
    if (lastImportPeople.length > 0) {
      openPersonPicker(lastImportPeople, async (name) => {
        setActivePersonName(name);
        await setIdentity(name);
      });
    } else {
      const name = prompt('Your name, as it should appear:', activePersonName);
      if (name) { setActivePersonName(name); setIdentity(name); }
    }
  }

  async function signOutAndStayLocal() {
    await signOut();
    router.push('/');
    router.refresh();
  }

  async function updateShiftType(code, patch) {
    await db.shiftTypes.update(code, patch);
    await rescheduleAll();
  }
  async function addCustomShift() {
    const code = prompt('New one-letter (or short) code, e.g. "T" for training:');
    if (!code) return;
    const exists = await db.shiftTypes.get(code.toUpperCase());
    if (exists) return alert('That code already exists.');
    await db.shiftTypes.put({ code: code.toUpperCase(), name: 'New shift', start: '08:00', end: '17:00', crossesMidnight: false, color: '#8A8F9C', icon: '●', system: false });
  }

  async function exportBackup() {
    const data = {
      shiftTypes: await db.shiftTypes.toArray(),
      roster: await db.roster.toArray(),
      alarmRules: await db.alarmRules.toArray(),
      settings: await db.settings.toArray(),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dutyroster-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  async function importBackup(file) {
    if (!file) return;
    const data = JSON.parse(await file.text());
    if (!confirm('Import will merge into your current data (matching dates/codes are overwritten). Continue?')) return;
    if (data.shiftTypes) await db.shiftTypes.bulkPut(data.shiftTypes);
    if (data.alarmRules) await db.alarmRules.bulkPut(data.alarmRules.map((r) => ({ ...r, id: undefined })));
    if (data.roster) for (const r of data.roster) {
      const existing = await db.roster.where('date').equals(r.date).first();
      const row = { ...r, id: undefined };
      if (existing) await db.roster.update(existing.id, row); else await db.roster.add(row);
    }
    if (data.settings) await db.settings.bulkPut(data.settings);
    await rescheduleAll();
    alert('Backup imported.');
  }

  async function wipeAll() {
    if (!confirm('This deletes ALL roster data, alarms and settings from this device. This cannot be undone. Continue?')) return;
    await db.delete();
    location.reload();
  }

  return (
    <section className="page">
      <header className="page-head"><h1>Settings</h1></header>

      <div className="panel">
        <h2>Account</h2>
        {user ? (
          <>
            <p className="mini-main">Signed in as {user.email}</p>
            <p className="muted-note">Your roster syncs across every device you sign in on.</p>
            <button className="btn btn-danger" onClick={signOutAndStayLocal}>Sign out (keep local copy)</button>
          </>
        ) : (
          <>
            <p className="muted-note">Not signed in. Data lives only on this device.</p>
            <Link href="/login" className="btn">Sign in to sync</Link>
          </>
        )}
      </div>

      <div className="panel">
        <h2>Sync</h2>
        <div className="sync-row">
          <span>Last synced</span>
          <strong>{syncStatus.lastSyncedAt ? new Date(syncStatus.lastSyncedAt).toLocaleString() : 'never'}</strong>
        </div>
        <div className="sync-row">
          <span>Pending changes</span>
          <strong>{syncStatus.pending ?? 0}</strong>
        </div>
        <button
          className="btn"
          disabled={!syncStatus.signedIn || syncStatus.syncing}
          onClick={() => syncNow()}
        >
          {syncStatus.syncing ? 'Syncing…' : 'Sync now'}
        </button>
        <p className="muted-note">
          {syncStatus.signedIn
            ? 'Changes here sync automatically when online.'
            : 'Sign in to sync across devices. Imported files are never uploaded — only the shift rows you confirm.'}
        </p>
      </div>

      <div className="panel">
        <h2>Identity</h2>
        <p className="muted-note">
          When a roster has many people on it, DutyRoster only imports the row that belongs to you.
          {syncStatus.signedIn && ' Your identity also syncs with your account.'}
        </p>
        <p className="mini-main">{activePersonName || 'Not set yet'}</p>
        <button className="btn" onClick={changeIdentity}>Change identity</button>
      </div>

      <div className="panel">
        <h2>Profile</h2>
        <label>Name <input value={userName} onChange={(e) => setUserName(e.target.value)} onBlur={() => setSetting('userName', userName)} /></label>
        <label>Timezone <input value={timezone} onChange={(e) => setTimezone(e.target.value)} onBlur={() => setSetting('timezone', timezone)} /></label>
      </div>

      <div className="panel">
        <h2>Shift types</h2>
        <div className="shift-editor">
          {shiftTypes.map((s) => (
            <div className="shift-card" style={{ '--accent': s.color }} key={s.code}>
              <div className="shift-card-head">
                <input className="se-icon" value={s.icon} onChange={(e) => updateShiftType(s.code, { icon: e.target.value })} title="Icon" />
                <span className="se-code">{s.code}</span>
                <input className="se-name" value={s.name} onChange={(e) => updateShiftType(s.code, { name: e.target.value })} placeholder="Shift name" />
              </div>
              <div className="shift-card-fields">
                <label>Start <input type="time" value={s.start || ''} disabled={s.start === null} onChange={(e) => updateShiftType(s.code, { start: e.target.value })} /></label>
                <label>End <input type="time" value={s.end || ''} disabled={s.end === null} onChange={(e) => updateShiftType(s.code, { end: e.target.value })} /></label>
              </div>
              <label className="se-color-label">
                <input type="color" value={s.color} onChange={(e) => updateShiftType(s.code, { color: e.target.value })} />
                Accent color
              </label>
            </div>
          ))}
        </div>
        <button className="btn" onClick={addCustomShift}>+ Add custom shift code</button>
      </div>

      <div className="panel">
        <h2>Smart alarm calculation (defaults)</h2>
        <label>Preparation time (min) <input type="number" value={prep} onChange={(e) => setPrep(Number(e.target.value))} onBlur={() => setSetting('defaultPrep', prep)} /></label>
        <label>Travel time (min) <input type="number" value={travel} onChange={(e) => setTravel(Number(e.target.value))} onBlur={() => setSetting('defaultTravel', travel)} /></label>
        <label>Safety buffer (min) <input type="number" value={buffer} onChange={(e) => setBuffer(Number(e.target.value))} onBlur={() => setSetting('defaultBuffer', buffer)} /></label>
        <p className="muted-note">Suggested wake-up = shift start − (prep + travel + buffer). Apply per shift under Alarms.</p>
      </div>

      <div className="panel">
        <h2>Notifications</h2>
        <label className="row-check">
          <input type="checkbox" checked={weeklySummary} onChange={(e) => { setWeeklySummary(e.target.checked); setSetting('weeklySummary', e.target.checked); }} />
          Sunday evening — send me next week's roster
        </label>
        <label className="row-check">
          <input type="checkbox" checked={offDayNotify} onChange={(e) => { setOffDayNotify(e.target.checked); setSetting('offDayNotify', e.target.checked); }} />
          Tell me about off days too
        </label>
      </div>

      <div className="panel">
        <h2>Backup &amp; data</h2>
        <p className="muted-note">Everything is stored only on this device (IndexedDB). Export a backup regularly.</p>
        <div className="head-actions">
          <button className="btn" onClick={exportBackup}>Export backup (.json)</button>
          <label className="btn file-btn">Import backup<input type="file" accept="application/json" hidden onChange={(e) => importBackup(e.target.files[0])} /></label>
        </div>
        <button className="btn btn-danger" onClick={wipeAll}>Erase all data</button>
      </div>

      <p className="version-note">DutyRoster · Next.js · runs on this device + your account · v1.0</p>
    </section>
  );
}