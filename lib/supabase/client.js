// lib/supabase/client.js — browser-only Supabase client.
// Used by the auth state provider, sync engine and realtime subscriptions.
// Never import this in a Server Component.
'use client';

import { createBrowserClient } from '@supabase/ssr';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function createClient() {
  if (!url || !key) {
    // Deployment without the Supabase env vars: fall back to local-only mode
    // instead of crashing with "URL and Key are required to create a client".
    if (typeof window !== 'undefined') {
      console.warn('[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set — running in local-only mode.');
    }
    return null;
  }
  return createBrowserClient(url, key);
}

export const supabase = typeof window !== 'undefined' ? createClient() : null;