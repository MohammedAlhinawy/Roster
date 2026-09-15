import { db, toISODate, pad } from '../db.js';
import { openEntryModal } from './roster.js';

let cursor = new Date(); // month being viewed

export async function renderCalendar(root) {
  const shiftTypes = Object.fromEntries((await db.shiftTypes.toArray()).map(s => [s.code, s]));
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthRows = await db.roster.where('date').between(
    `${year}-${pad(month + 1)}-01`, `${year}-${pad(month + 1)}-31`
  ).toArray();
  const byDate = Object.fromEntries(monthRows.map(r => [r.date, r]));
  const todayIso = toISODate(new Date());

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push('<div class="cal-cell empty"></div>');
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${pad(month + 1)}-${pad(d)}`;
    const entry = byDate[iso];
    const st = entry ? shiftTypes[entry.code] : null;
    cells.push(`
      <button class="cal-cell${iso === todayIso ? ' is-today' : ''}" data-date="${iso}" style="${st ? `--accent:${st.color}` : ''}">
        <span class="cal-daynum">${d}</span>
        ${st ? `<span class="cal-badge">${st.code}</span>` : ''}
      </button>`);
  }

  root.innerHTML = `
    <section class="page calendar-page">
      <header class="page-head cal-head">
        <button class="icon-btn" id="cal-prev">‹</button>
        <h1>${first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h1>
        <button class="icon-btn" id="cal-next">›</button>
      </header>
      <div class="cal-weekdays">
        ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(w => `<span>${w}</span>`).join('')}
      </div>
      <div class="cal-grid">${cells.join('')}</div>
      <div class="cal-legend">
        ${Object.values(shiftTypes).map(s => `<span class="legend-item"><i style="background:${s.color}"></i>${s.code} · ${s.name}</span>`).join('')}
      </div>
    </section>
  `;

  root.querySelector('#cal-prev').onclick = () => { cursor = new Date(year, month - 1, 1); renderCalendar(root); };
  root.querySelector('#cal-next').onclick = () => { cursor = new Date(year, month + 1, 1); renderCalendar(root); };
  root.querySelectorAll('.cal-cell[data-date]').forEach(btn => {
    btn.onclick = () => openEntryModal(btn.dataset.date, () => renderCalendar(root));
  });
}
