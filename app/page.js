'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { db, getActiveEntry, getUpcoming, todayISO, addDays, shiftDateTimes, weekday } from '../lib/db';

function fmtCountdown(ms) {
  if (ms < 0) ms = 0;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export default function DashboardPage() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const shiftTypes = useLiveQuery(async () => {
    if (!db) return {};
    return Object.fromEntries((await db.shiftTypes.toArray()).map((s) => [s.code, s]));
  }, [], {});

  const today = todayISO();

  const active = useLiveQuery(() => getActiveEntry(new Date(now)), [now], null);
  const todayEntry = useLiveQuery(() => (db ? db.roster.where('date').equals(today).first() : null), [today], null);
  const upcoming14 = useLiveQuery(() => getUpcoming(addDays(today, 1), 14), [today], []);
  const next7 = useLiveQuery(() => getUpcoming(today, 7), [today], []);

  if (!shiftTypes) return null;

  const nextDuty = upcoming14.find((u) => u.entry && u.entry.code !== 'O');
  const nextOff = upcoming14.find((u) => u.entry && u.entry.code === 'O');

  let hero;
  if (active) {
    const st = active.shiftType;
    const remaining = new Date(active.times.end).getTime() - now;
    hero = (
      <div className="hero-status" style={{ '--accent': st.color }}>
        <span className="hero-icon">{st.icon}</span>
        <div className="hero-code">ON DUTY</div>
        <div className="hero-name">{st.name}</div>
        <div className="hero-time">{st.start} – {st.end}</div>
        <div className="hero-countdown">Ends in {fmtCountdown(remaining)}</div>
      </div>
    );
  } else if (todayEntry) {
    const st = shiftTypes[todayEntry.code];
    let sub = '';
    if (st?.start) {
      const times = shiftDateTimes(todayEntry, st);
      const untilStart = new Date(times.start).getTime() - now;
      sub = untilStart > 0 ? `Starts in ${fmtCountdown(untilStart)}` : `${st.start} – ${st.end}`;
    } else if (st?.code === 'O') sub = 'Enjoy your day off.';
    else if (st?.code === 'L') sub = 'On leave.';
    hero = (
      <div className="hero-status" style={{ '--accent': st?.color }}>
        <span className="hero-icon">{st?.icon}</span>
        <div className="hero-code">TODAY</div>
        <div className="hero-name">{st?.name}</div>
        {st?.start && <div className="hero-time">{st.start} – {st.end}</div>}
        <div className="hero-countdown">{sub}</div>
      </div>
    );
  } else {
    hero = (
      <div className="hero-status hero-empty">
        <span className="hero-icon">＋</span>
        <div className="hero-name">No duty entered for today</div>
        <div className="hero-countdown"><Link href="/roster">Add today's roster →</Link></div>
      </div>
    );
  }

  return (
    <section className="page">
      {hero}

      <div className="side-by-side">
        <div className="mini-card">
          <p className="mini-label">Next duty</p>
          {nextDuty ? (
            <>
              <p className="mini-main">{shiftTypes[nextDuty.entry.code]?.icon} {shiftTypes[nextDuty.entry.code]?.name}</p>
              <p className="mini-sub">{weekday(nextDuty.date)}</p>
            </>
          ) : <p className="mini-sub">Nothing scheduled yet</p>}
        </div>
        <div className="mini-card">
          <p className="mini-label">Next off day</p>
          {nextOff ? (
            <>
              <p className="mini-main">⚪ Off</p>
              <p className="mini-sub">{weekday(nextOff.date)}</p>
            </>
          ) : <p className="mini-sub">None in the next two weeks</p>}
        </div>
      </div>

      <h2 className="section-title">Next 7 days</h2>
      <ul className="upcoming-list">
        {next7.map(({ date, entry }) => {
          const st = entry ? shiftTypes[entry.code] : null;
          return (
            <li key={date}>
              <span className="up-date">{date === today ? 'Today' : weekday(date).slice(0, 3)}</span>
              <span className="up-code" style={{ '--accent': st?.color || '#555' }}>{st?.icon || '—'}</span>
              <span className="up-name">{st?.name || 'Not set'}</span>
              <span className="up-time">{st?.start ? `${st.start}–${st.end}` : ''}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
