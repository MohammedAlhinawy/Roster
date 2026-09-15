import { db, getActiveEntry, getUpcoming, todayISO, addDays, shiftDateTimes } from '../db.js';

function fmtCountdown(ms) {
  if (ms < 0) ms = 0;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function weekday(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
}
function dayLabel(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

export async function renderDashboard(root) {
  const shiftTypes = Object.fromEntries((await db.shiftTypes.toArray()).map(s => [s.code, s]));
  const active = await getActiveEntry();
  const today = todayISO();
  const todayEntry = await db.roster.where('date').equals(today).first();
  const upcoming = await getUpcoming(addDays(today, 1), 14);
  const nextDuty = upcoming.find(u => u.entry && !['O'].includes(u.entry.code));
  const nextOff = upcoming.find(u => u.entry && u.entry.code === 'O');
  const next7 = await getUpcoming(today, 7);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  let heroHTML;
  if (active) {
    const st = active.shiftType;
    const remaining = active.times.end - Date.now();
    const isFuture = active.entry.date !== today; // spillover from yesterday's night shift
    heroHTML = `
      <div class="hero-status" style="--accent:${st.color}">
        <span class="hero-icon">${st.icon}</span>
        <div class="hero-code">ON DUTY</div>
        <div class="hero-name">${st.name}</div>
        <div class="hero-time">${st.start || ''} ${st.end ? '– ' + st.end : ''}</div>
        <div class="hero-countdown">Ends in ${fmtCountdown(remaining)}</div>
      </div>`;
  } else if (todayEntry) {
    const st = shiftTypes[todayEntry.code];
    let sub = '';
    if (st.start) {
      const times = shiftDateTimes(todayEntry, st);
      const untilStart = times.start - Date.now();
      sub = untilStart > 0 ? `Starts in ${fmtCountdown(untilStart)}` : `${st.start} – ${st.end}`;
    } else if (st.code === 'O') sub = 'Enjoy your day off.';
    else if (st.code === 'L') sub = 'On leave.';
    heroHTML = `
      <div class="hero-status" style="--accent:${st.color}">
        <span class="hero-icon">${st.icon}</span>
        <div class="hero-code">TODAY</div>
        <div class="hero-name">${st.name}</div>
        ${st.start ? `<div class="hero-time">${st.start} – ${st.end}</div>` : ''}
        <div class="hero-countdown">${sub}</div>
      </div>`;
  } else {
    heroHTML = `
      <div class="hero-status hero-empty">
        <span class="hero-icon">＋</span>
        <div class="hero-name">No duty entered for today</div>
        <div class="hero-countdown"><a href="#/roster">Add today's roster →</a></div>
      </div>`;
  }

  root.innerHTML = `
    <section class="page dashboard">
      <header class="page-head">
        <p class="eyebrow-plain">${greeting}${'name' ? '' : ''}</p>
        <h1>${weekday(today)}, ${dayLabel(today)}</h1>
      </header>

      ${heroHTML}

      <div class="side-by-side">
        <div class="mini-card">
          <p class="mini-label">Next duty</p>
          ${nextDuty ? `
            <p class="mini-main">${shiftTypes[nextDuty.entry.code].icon} ${shiftTypes[nextDuty.entry.code].name}</p>
            <p class="mini-sub">${weekday(nextDuty.date)}, ${dayLabel(nextDuty.date)}</p>
          ` : `<p class="mini-sub">Nothing scheduled yet</p>`}
        </div>
        <div class="mini-card">
          <p class="mini-label">Next off day</p>
          ${nextOff ? `
            <p class="mini-main">⚪ Off</p>
            <p class="mini-sub">${weekday(nextOff.date)}, ${dayLabel(nextOff.date)}</p>
          ` : `<p class="mini-sub">None in the next two weeks</p>`}
        </div>
      </div>

      <h2 class="section-title">Next 7 days</h2>
      <ul class="upcoming-list">
        ${next7.map(({ date, entry }) => {
          const st = entry ? shiftTypes[entry.code] : null;
          return `<li>
            <span class="up-date">${date === today ? 'Today' : weekday(date).slice(0, 3)}</span>
            <span class="up-code" style="--accent:${st ? st.color : '#555'}">${st ? st.icon : '—'}</span>
            <span class="up-name">${st ? st.name : 'Not set'}</span>
            <span class="up-time">${st && st.start ? st.start + '–' + st.end : ''}</span>
          </li>`;
        }).join('')}
      </ul>
    </section>
  `;
}
