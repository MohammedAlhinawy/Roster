'use client';

import EntryModal from './modals/EntryModal';
import BulkModal from './modals/BulkModal';
import PersonPickerModal from './modals/PersonPickerModal';
import AlarmModal from './modals/AlarmModal';
import OnboardModal from './modals/OnboardModal';

export default function ModalHost() {
  return (
    <>
      <EntryModal />
      <BulkModal />
      <PersonPickerModal />
      <AlarmModal />
      <OnboardModal />
    </>
  );
}
