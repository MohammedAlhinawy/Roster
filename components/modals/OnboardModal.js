'use client';

import { useState } from 'react';
import Modal from '../Modal';
import { useModal } from '../../context/ModalContext';
import { setSetting } from '../../lib/db';
import { requestPermission } from '../../lib/notify';

export default function OnboardModal() {
  const { onboard, closeOnboard } = useModal();
  const [name, setName] = useState('');

  async function finish(withPermission) {
    if (name.trim()) await setSetting('userName', name.trim());
    await setSetting('onboarded', true);
    if (withPermission) await requestPermission();
    closeOnboard();
  }

  return (
    <Modal open={onboard.open} onClose={() => {}}>
      <p className="eyebrow-plain">Welcome to</p>
      <h2>DutyRoster</h2>
      <p className="modal-hint">Know when you work, know when you're off, and never miss a duty because you forgot your roster.</p>
      <label>Your name <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" /></label>
      <div className="modal-actions">
        <button className="btn" onClick={() => finish(false)}>Skip</button>
        <button className="btn btn-primary" onClick={() => finish(true)}>Get started</button>
      </div>
    </Modal>
  );
}
