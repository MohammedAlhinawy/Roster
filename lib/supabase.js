// lib/supabase.js — Supabase client. Uses the dedicated "tra_dutyroster"
// schema (Supabase hosts one Postgres database per project, so the requested
// database name is implemented as a schema). No auth for now: RLS is off in
// the bootstrap SQL, so the publishable key can read and write freely in the
// browser.
'use client';

import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { db: { schema: 'tra_dutyroster' } }
);