import { db, todayISO, addDays } from '../db.js';
import { rescheduleAll } from '../notify.js';

export async function renderRoster(root) {
  const shiftTypes = await db.shiftTypes.toArray();
  const rows = await db.roster.orderBy('date').reverse().limit(60).toArray();
  const byCode = Object.fromEntries(shiftTypes.map(s => [s.code, s]));

  root.innerHTML = `
    <section class="page">
      <header class="page-head row">
        <h1>Roster</h1>
        <div class="head-actions">
          <button class="btn" id="bulk-btn">Bulk entry</button>
          <button class="btn btn-primary" id="add-btn">Add entry</button>
        </div>
      </header>
      <div class="roster-table">
        ${rows.length === 0 ? `<p class="empty-note">No roster entries yet. Add one, paste a month, or import a file from the Import page.</p>` : rows.map(r => {
          const st = byCode[r.code] || {};
          return `<div class="roster-row" data-date="${r.date}" style="--accent:${st.color || '#555'}">
            <span class="rr-date">${new Date(r.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}</span>
            <span class="rr-badge">${st.icon || ''} ${r.code}</span>
            <span class="rr-name">${st.name || r.code}${r.location ? ' · ' + r.location : ''}</span>
            <span class="rr-time">${st.start ? `${r.start || st.start}–${r.end || st.end}` : ''}</span>
            <button class="rr-del" title="Delete">✕</button>
          </div>`;
        }).join('')}
      </div>
    </section>
  `;

  root.querySelector('#add-btn').onclick = () => openEntryModal(todayISO(), () => renderRoster(root));
  root.querySelector('#bulk-btn').onclick = () => openBulkModal(() => renderRoster(root));
  root.querySelectorAll('.roster-row').forEach(rowEl => {
    rowEl.querySelector('.rr-del').onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this roster entry and its alarms?')) return;
      await db.roster.where('date').equals(rowEl.dataset.date).delete();
      await rescheduleAll();
      renderRoster(root);
    };
    rowEl.onclick = () => openEntryModal(rowEl.dataset.date, () => renderRoster(root));
  });
}

// ---- single entry modal (shared, lives in index.html) ----
export async function openEntryModal(dateIso, onDone) {
  const modal = document.getElementById('entry-modal');
  const shiftTypes = await db.shiftTypes.toArray();
  const select = modal.querySelector('#em-code');
  select.innerHTML = shiftTypes.map(s => `<option value="${s.code}">${s.code} — ${s.name}</option>`).join('');

  const existing = await db.roster.where('date').equals(dateIso).first();
  modal.dataset.date = dateIso;
  modal.querySelector('#entry-modal-title').textContent = existing ? 'Edit roster entry' : 'Add roster entry';
  modal.querySelector('#em-date').value = dateIso;
  select.value = existing ? existing.code : 'M';
  modal.querySelector('#em-start').value = existing?.start || '';
  modal.querySelector('#em-end').value = existing?.end || '';
  modal.querySelector('#em-location').value = existing?.location || '';
  modal.querySelector('#em-notes').value = existing?.notes || '';
  modal.querySelector('#em-leave-end').value = existing?.leaveEnd || '';
  toggleFieldsForCode(select.value);
  modal.classList.remove('hidden');
  modal._onDone = onDone;
}

function toggleFieldsForCode(code) {
  document.getElementById('em-time-fields').classList.toggle('hidden', code === 'O' || code === 'L');
  document.getElementById('em-leave-end-wrap').classList.toggle('hidden', code !== 'L');
}

export function wireGlobalModals() {
  const modal = document.getElementById('entry-modal');
  modal.querySelector('#em-code').onchange = (e) => toggleFieldsForCode(e.target.value);
  modal.querySelector('#em-cancel').onclick = () => modal.classList.add('hidden');
  modal.querySelector('#em-save').onclick = async () => {
    const date = modal.querySelector('#em-date').value;
    const code = modal.querySelector('#em-code').value;
    const leaveEnd = modal.querySelector('#em-leave-end').value;
    const base = {
      date, code,
      start: modal.querySelector('#em-start').value || null,
      end: modal.querySelector('#em-end').value || null,
      location: modal.querySelector('#em-location').value || null,
      notes: modal.querySelector('#em-notes').value || null,
      source: 'manual'
    };
    const existing = await db.roster.where('date').equals(date).first();
    if (existing) await db.roster.update(existing.id, base);
    else await db.roster.add(base);

    // Leave range: fan out identical entries across the date range.
    if (code === 'L' && leaveEnd && leaveEnd > date) {
      let d = date;
      while (d < leaveEnd) {
        d = addDays(d, 1);
        const ex = await db.roster.where('date').equals(d).first();
        const row = { ...base, date: d };
        if (ex) await db.roster.update(ex.id, row); else await db.roster.add(row);
      }
    }
    await rescheduleAll();
    modal.classList.add('hidden');
    if (modal._onDone) modal._onDone();
  };

  const bulk = document.getElementById('bulk-modal');
  bulk.querySelector('#bulk-cancel').onclick = () => bulk.classList.add('hidden');
  bulk.querySelector('#bulk-save').onclick = async () => {
    const [y, m] = bulk.querySelector('#bulk-month').value.split('-').map(Number);
    const codes = bulk.querySelector('#bulk-codes').value.trim().split(/[\s,]+/).filter(Boolean);
    const daysInMonth = new Date(y, m, 0).getDate();
    const rows = [];
    for (let i = 0; i < codes.length && i < daysInMonth; i++) {
      const date = `${y}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
      rows.push({ date, code: codes[i].toUpperCase(), source: 'bulk' });
    }
    for (const r of rows) {
      const existing = await db.roster.where('date').equals(r.date).first();
      if (existing) await db.roster.update(existing.id, r); else await db.roster.add(r);
    }
    await rescheduleAll();
    bulk.classList.add('hidden');
    if (bulk._onDone) bulk._onDone();
  };
}

export function openBulkModal(onDone) {
  const bulk = document.getElementById('bulk-modal');
  const now = new Date();
  bulk.querySelector('#bulk-month').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  bulk.querySelector('#bulk-codes').value = '';
  bulk._onDone = onDone;
  bulk.classList.remove('hidden');
}
