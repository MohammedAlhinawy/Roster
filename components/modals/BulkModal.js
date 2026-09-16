'use client';

import { useState } from 'react';
import Modal from '../Modal';
import { useModal } from '../../context/ModalContext';
import { db } from '../../lib/db';
import { rescheduleAll } from '../../lib/notify';

export default function BulkModal() {
  const { bulk, closeBulk } = useModal();
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [codes, setCodes] = useState('');

  async function save() {
    const [y, m] = month.split('-').map(Number);
    const list = codes.trim().split(/[\s,]+/).filter(Boolean);
    const daysInMonth = new Date(y, m, 0).getDate();
    for (let i = 0; i < list.length && i < daysInMonth; i++) {
      const date = `${y}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
      const row = { date, code: list[i].toUpperCase(), source: 'bulk' };
      const existing = await db.roster.where('date').equals(date).first();
      if (existing) await db.roster.update(existing.id, row);
      else await db.roster.add(row);
    }
    await rescheduleAll();
    setCodes('');
    closeBulk();
    bulk.onSaved?.();
  }

  return (
    <Modal open={bulk.open} onClose={closeBulk}>
      <h2>Bulk month entry</h2>
      <p className="modal-hint">
        One shift code per day, in order (spaces, commas or new lines all work). Example: <code>M M O N N O M M O N N O</code>
      </p>
      <label>Month <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
      <label>Codes <textarea rows={6} value={codes} onChange={(e) => setCodes(e.target.value)} placeholder="M M O N N O ..." /></label>
      <div className="modal-actions">
        <button className="btn" onClick={closeBulk}>Cancel</button>
        <button className="btn btn-primary" onClick={save}>Save month</button>
      </div>
    </Modal>
  );
}
