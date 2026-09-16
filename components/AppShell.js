'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { ModalProvider, useModal } from '../context/ModalContext';
import AppBar from './AppBar';
import BottomNav from './BottomNav';
import ModalHost from './ModalHost';
import { ensureSeeded, getSetting } from '../lib/db';
import { rescheduleAll, setAlarmHandler } from '../lib/notify';

function Boot() {
  const { openOnboard, openAlarm } = useModal();

  useEffect(() => {
    setAlarmHandler((title, body) => openAlarm(title, body));

    (async () => {
      await ensureSeeded();
      const onboarded = await getSetting('onboarded');
      if (!onboarded) openOnboard();
      await rescheduleAll();
    })();

    const onVisible = () => {
      if (document.visibilityState === 'visible') rescheduleAll();
    };
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(() => rescheduleAll(), 30 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function AnimatedBody({ children }) {
  const pathname = usePathname();
  return (
    <main className="app-body">
      <div key={pathname} className="page-transition">
        {children}
      </div>
    </main>
  );
}

export default function AppShell({ children }) {
  return (
    <ModalProvider>
      <Boot />
      <div className="app-frame">
        <AppBar />
        <AnimatedBody>{children}</AnimatedBody>
        <BottomNav />
      </div>
      <ModalHost />
    </ModalProvider>
  );
}
