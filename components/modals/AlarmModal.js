'use client';

import Modal from '../Modal';
import { useModal } from '../../context/ModalContext';
import { getSetting } from '../../lib/db';

export default function AlarmModal() {
  const { alarm, closeAlarm, openAlarm } = useModal();

  async function snooze() {
    const title = alarm.title, body = alarm.body;
    closeAlarm();
    const mins = Number(await getSetting('backupAlarmMinutes')) || 10;
    setTimeout(() => openAlarm(title, body), mins * 60000);
  }

  return (
    <Modal open={alarm.open} onClose={() => {}} size="alarm">
      <div className="alarm-ring" />
      <p className="alarm-title">{alarm.title}</p>
      <p className="alarm-body">{alarm.body}</p>
      <div className="modal-actions center">
        <button className="btn" onClick={snooze}>Snooze</button>
        <button className="btn btn-primary" onClick={closeAlarm}>Dismiss</button>
      </div>
    </Modal>
  );
}
