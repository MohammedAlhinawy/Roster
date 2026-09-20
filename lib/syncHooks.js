'use client';

import { useEffect, useState } from 'react';
import { getSyncStatus, subscribeSyncStatus } from './sync';

export function useSyncStatus() {
  const [status, setStatus] = useState({
    enabled: false,
    signedIn: false,
    syncing: false,
    lastSyncedAt: null,
    signedInAs: null,
    pending: 0,
  });

  useEffect(() => {
    let mounted = true;
    getSyncStatus().then((s) => { if (mounted) setStatus(s); });
    const refresh = async () => {
      if (!mounted) return;
      setStatus(await getSyncStatus());
    };
    const unsub = subscribeSyncStatus(refresh);
    return () => { mounted = false; unsub(); };
  }, []);

  return status;
}