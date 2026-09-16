'use client';

import { useState } from 'react';
import Modal from '../Modal';
import { useModal } from '../../context/ModalContext';

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

export default function PersonPickerModal() {
  const { personPicker, closePersonPicker } = useModal();
  const [manual, setManual] = useState('');

  function pick(name) {
    personPicker.onSelect?.(name);
    closePersonPicker();
    setManual('');
  }

  return (
    <Modal open={personPicker.open} onClose={closePersonPicker}>
      <h2>Which one is you?</h2>
      <p className="modal-hint">
        This roster has {personPicker.people?.length || 0} people on it. Pick your name so DutyRoster only imports
        your own shifts — no one else's schedule is saved.
      </p>
      <div className="person-list">
        {personPicker.people?.map((name) => (
          <button key={name} className="person-row" onClick={() => pick(name)}>
            <span className="person-avatar">{initials(name)}</span>
            <span>{name}</span>
          </button>
        ))}
      </div>
      <label>
        Not listed correctly? Type your name as it appears
        <input
          type="text"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="e.g. Nguba"
        />
      </label>
      <div className="modal-actions">
        <button className="btn" onClick={closePersonPicker}>Cancel</button>
        <button className="btn btn-primary" disabled={!manual.trim()} onClick={() => pick(manual.trim())}>
          Use this name
        </button>
      </div>
    </Modal>
  );
}
