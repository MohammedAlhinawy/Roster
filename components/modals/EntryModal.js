'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Modal from '../Modal';
import { useModal } from '../../context/ModalContext';
import { db, addDays } from '../../lib/db';
import { rescheduleAll } from '../../lib/notify';

const empty = { code: 'M', start: '', end: '', location: '', notes: '', leaveEnd: '' };

export default function EntryModal() {
  const { entry, closeEntry } = useModal();
  const shiftTypes = useLiveQuery(() => (db ? db.shiftTypes.toArray() : []), [], []);
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (!entry.open || !entry.date || !db) return;
    db.roster.where('date').equals(entry.date).first().then((existing) => {
      setForm(existing ? { ...empty, ...existing } : { ...empty, code: 'M' });
    });
  }, [entry.open, entry.date]);

  if (!shiftTypes) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const showTime = form.code !== 'O' && form.code !== 'L';
  const showLeaveEnd = form.code === 'L';

  async function save() {
    const base = {
      date: entry.date,
      code: form.code,
      start: form.start || null,
      end: form.end || null,
      location: form.location || null,
      notes: form.notes || null,
      source: 'manual',
    };
    const existing = await db.roster.where('date').equals(entry.date).first();
    if (existing) await db.roster.update(existing.id, base);
    else await db.roster.add(base);

    if (form.code === 'L' && form.leaveEnd && form.leaveEnd > entry.date) {
      let d = entry.date;
      while (d < form.leaveEnd) {
        d = addDays(d, 1);
        const ex = await db.roster.where('date').equals(d).first();
        const row = { ...base, date: d };
        if (ex) await db.roster.update(ex.id, row);
        else await db.roster.add(row);
      }
    }
    await rescheduleAll();
    closeEntry();
    entry.onSaved?.();
  }

  return (
    <Modal open={entry.open} onClose={closeEntry}>
      <h2>{form.id ? 'Edit roster entry' : 'Add roster entry'}</h2>
      <label>
        Date
        <input type="date" value={entry.date || ''} disabled />
      </label>
      <label>
        Status
        <select value={form.code} onChange={set('code')}>
          {shiftTypes.map((s) => (
            <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
          ))}
        </select>
      </label>
      {showTime && (
        <div className="row-fields">
          <label>Start <input type="time" value={form.start || ''} onChange={set('start')} /></label>
          <label>End <input type="time" value={form.end || ''} onChange={set('end')} /></label>
        </div>
      )}
      <label>Location <input type="text" value={form.location || ''} onChange={set('location')} placeholder="e.g. TRA HQ" /></label>
      <label>Notes <input type="text" value={form.notes || ''} onChange={set('notes')} /></label>
      {showLeaveEnd && (
        <label>Leave ends <input type="date" value={form.leaveEnd || ''} onChange={set('leaveEnd')} /></label>
      )}
      <div className="modal-actions">
        <button className="btn" onClick={closeEntry}>Cancel</button>
        <button className="btn btn-primary" onClick={save}>Save</button>
      </div>
    </Modal>
  );
}
