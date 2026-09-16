'use client';

import { createContext, useContext, useState, useCallback } from 'react';

const ModalCtx = createContext(null);

export function ModalProvider({ children }) {
  const [entry, setEntry] = useState({ open: false, date: null, onSaved: null });
  const [bulk, setBulk] = useState({ open: false, onSaved: null });
  const [personPicker, setPersonPicker] = useState({ open: false, people: [], onSelect: null });
  const [alarm, setAlarm] = useState({ open: false, title: '', body: '' });
  const [onboard, setOnboard] = useState({ open: false });

  const openEntry = useCallback((date, onSaved) => setEntry({ open: true, date, onSaved }), []);
  const closeEntry = useCallback(() => setEntry((s) => ({ ...s, open: false })), []);

  const openBulk = useCallback((onSaved) => setBulk({ open: true, onSaved }), []);
  const closeBulk = useCallback(() => setBulk((s) => ({ ...s, open: false })), []);

  const openPersonPicker = useCallback((people, onSelect) => setPersonPicker({ open: true, people, onSelect }), []);
  const closePersonPicker = useCallback(() => setPersonPicker((s) => ({ ...s, open: false })), []);

  const openAlarm = useCallback((title, body) => setAlarm({ open: true, title, body }), []);
  const closeAlarm = useCallback(() => setAlarm((s) => ({ ...s, open: false })), []);

  const openOnboard = useCallback(() => setOnboard({ open: true }), []);
  const closeOnboard = useCallback(() => setOnboard({ open: false }), []);

  const value = {
    entry, openEntry, closeEntry,
    bulk, openBulk, closeBulk,
    personPicker, openPersonPicker, closePersonPicker,
    alarm, openAlarm, closeAlarm,
    onboard, openOnboard, closeOnboard,
  };

  return <ModalCtx.Provider value={value}>{children}</ModalCtx.Provider>;
}

export function useModal() {
  const ctx = useContext(ModalCtx);
  if (!ctx) throw new Error('useModal must be used within ModalProvider');
  return ctx;
}
