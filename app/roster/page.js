'use client';

import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, todayISO } from '../../lib/db';
import { removeRoster } from '../../lib/sync';
import { useModal } from '../../context/ModalContext';

export default function RosterPage() {
  const { openEntry, openBulk } = useModal();

  const shiftTypes = useLiveQuery(async () => {
    if (!db) return {};
    return Object.fromEntries((await db.shiftTypes.toArray()).map((s) => [s.code, s]));
  }, [], {});

  const rows = useLiveQuery(() => (db ? db.roster.orderBy('date').reverse().limit(60).toArray() : []), [], []);

  async function del(date) {
    if (!confirm('Delete this roster entry and its alarms?')) return;
    await removeRoster(date);
  }

  return (
    <section className="page">
      <header className="page-head row">
        <h1>Roster</h1>
        <div className="head-actions">
          <Link href="/roster/import" className="btn">Import</Link>
          <button className="btn" onClick={() => openBulk(() => {})}>Bulk entry</button>
          <button className="btn btn-primary" onClick={() => openEntry(todayISO(), () => {})}>Add</button>
        </div>
      </header>
      <div className="roster-table">
        {rows.length === 0 ? (
          <p className="empty-note">No roster entries yet. Add one, paste a month, or import a file/photo.</p>
        ) : rows.map((r) => {
          const st = shiftTypes[r.code] || {};
          return (
            <div
              key={r.date}
              className="roster-row"
              style={{ '--accent': st.color || '#555' }}
              onClick={() => openEntry(r.date, () => {})}
            >
              <span className="rr-date">{new Date(r.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}</span>
              <span className="rr-badge">{st.icon} {r.code}</span>
              <span className="rr-name">{st.name || r.code}{r.location ? ' · ' + r.location : ''}</span>
              <span className="rr-time">{st.start ? `${r.start || st.start}–${r.end || st.end}` : ''}</span>
              <button className="rr-del" onClick={(e) => { e.stopPropagation(); del(r.date); }}>✕</button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
