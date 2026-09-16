'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, toISODate, pad } from '../../lib/db';
import { useModal } from '../../context/ModalContext';

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => new Date());
  const { openEntry } = useModal();

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayIso = toISODate(new Date());

  const shiftTypes = useLiveQuery(async () => {
    if (!db) return {};
    return Object.fromEntries((await db.shiftTypes.toArray()).map((s) => [s.code, s]));
  }, [], {});

  const byDate = useLiveQuery(async () => {
    if (!db) return {};
    const rows = await db.roster
      .where('date')
      .between(`${year}-${pad(month + 1)}-01`, `${year}-${pad(month + 1)}-31`)
      .toArray();
    return Object.fromEntries(rows.map((r) => [r.date, r]));
  }, [year, month], {});

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(<div key={`e${i}`} className="cal-cell empty" />);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${pad(month + 1)}-${pad(d)}`;
    const entry = byDate[iso];
    const st = entry ? shiftTypes[entry.code] : null;
    cells.push(
      <button
        key={iso}
        className={`cal-cell ${iso === todayIso ? 'is-today' : ''}`}
        style={st ? { '--accent': st.color } : undefined}
        onClick={() => openEntry(iso, () => {})}
      >
        <span className="cal-daynum">{d}</span>
        {st && <span className="cal-badge">{entry.code}</span>}
      </button>
    );
  }

  return (
    <section className="page">
      <header className="page-head cal-head">
        <button className="icon-btn" onClick={() => setCursor(new Date(year, month - 1, 1))}>‹</button>
        <h1>{first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h1>
        <button className="icon-btn" onClick={() => setCursor(new Date(year, month + 1, 1))}>›</button>
      </header>
      <div className="cal-weekdays">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className="cal-grid">{cells}</div>
      <div className="cal-legend">
        {Object.values(shiftTypes).map((s) => (
          <span className="legend-item" key={s.code}><i style={{ background: s.color }} />{s.code} · {s.name}</span>
        ))}
      </div>
    </section>
  );
}
