'use client';

import { useEffect } from 'react';
import { supabase } from '../lib/supabase/client';
import { enableSync, disableSync, syncNow } from '../lib/sync';

// Renders nothing. Watches Supabase auth state and starts/stops the sync
// engine (pull/push + realtime + auto triggers) accordingly.
export default function SyncEngine() {
  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session?.user) enableSync(data.session.user);
      else disableSync();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (session?.user) {
        enableSync(session.user);
      } else {
        disableSync();
      }
    });

    // visibilitychange → quick sync when returning to the tab
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncNow().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      disableSync();
    };
  }, []);

  return null;
}