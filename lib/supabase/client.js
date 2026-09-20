// lib/supabase/client.js — browser-only Supabase client.
// Used by the auth state provider, sync engine and realtime subscriptions.
// Never import this in a Server Component.
'use client';

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export const supabase = typeof window !== 'undefined' ? createClient() : null;