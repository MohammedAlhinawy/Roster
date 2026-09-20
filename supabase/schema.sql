-- ============================================================
-- TRA DutyRoster — shared Supabase schema
-- Apply this ONCE. Both the Next.js web app and the React Native
-- app talk to this exact schema. Do not diverge them.
--
-- Design rules baked into this schema:
--   * Every row is owned by a user; RLS enforces it.
--   * Sync is local-first: `updated_at` + soft deletes (`deleted_at`)
--     so a device that was offline can reconcile without losing rows.
--   * NO uploaded files are stored here. No Storage buckets, no
--     base64 columns, no file paths. Roster images / Excel / CSV are
--     parsed on-device and ONLY the resulting rows are synced.
--
-- NOTE: seed times/icons are aligned with the web app's defaults
-- (Morning 08:00–18:00, Night 18:00–08:00).
-- ============================================================


-- ---------- profiles ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  roster_name  text,                       -- the user's name AS PRINTED on the shared roster
  timezone     text not null default 'Africa/Dar_es_Salaam',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);


-- ---------- shift types (M / N / O / L / S + custom) ----------
create table if not exists public.shift_types (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  code             text not null,
  name             text not null,
  start_time       time,                   -- null for O / L
  end_time         time,
  crosses_midnight boolean not null default false,
  color            text not null default '#8A8F9C',
  icon             text not null default '*',
  is_system        boolean not null default false,
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (user_id, code)
);


-- ---------- roster entries: one row per date ----------
create table if not exists public.roster_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  duty_date  date not null,
  shift_code text not null,
  start_time time,                          -- overrides shift_type when set
  end_time   time,
  location   text,
  notes      text,
  source     text not null default 'manual',-- manual | bulk | import | ocr
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, duty_date)
);
create index if not exists roster_entries_user_date_idx
  on public.roster_entries (user_id, duty_date);


-- ---------- alarm / notification rules ----------
create table if not exists public.alarm_rules (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  shift_code     text not null,
  label          text not null,
  minutes_before integer not null default 60,
  kind           text not null default 'notification', -- 'alarm' | 'notification'
  enabled        boolean not null default true,
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index if not exists alarm_rules_user_idx on public.alarm_rules (user_id);


-- ---------- user settings (key/value) ----------
create table if not exists public.user_settings (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);


-- ---------- devices (for push) ----------
create table if not exists public.devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  platform     text not null,              -- ios | android | web
  push_token   text not null,
  app_version  text,
  last_seen_at timestamptz not null default now(),
  unique (user_id, push_token)
);


-- ============================================================
-- Row Level Security — every table, owner-only
-- ============================================================
alter table public.profiles       enable row level security;
alter table public.shift_types    enable row level security;
alter table public.roster_entries enable row level security;
alter table public.alarm_rules    enable row level security;
alter table public.user_settings  enable row level security;
alter table public.devices        enable row level security;


create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);


create policy "own shift_types" on public.shift_types
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


create policy "own roster_entries" on public.roster_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


create policy "own alarm_rules" on public.alarm_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


create policy "own user_settings" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


create policy "own devices" on public.devices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ============================================================
-- keep updated_at honest
-- ============================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;


do $$
declare t text;
begin
  foreach t in array array['profiles','shift_types','roster_entries','alarm_rules','user_settings']
  loop
    execute format(
      'drop trigger if exists touch_%1$s on public.%1$s;
       create trigger touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;


-- ============================================================
-- seed default shift types + alarm rules for a new user
-- ============================================================
create or replace function public.seed_defaults_for_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;

  insert into public.shift_types (user_id, code, name, start_time, end_time, crosses_midnight, color, icon, is_system)
  values
    (new.id, 'M', 'Morning Shift',   '08:00', '18:00', false, '#E8A33D', '🟢', true),
    (new.id, 'N', 'Night Shift',     '18:00', '08:00', true,  '#5B7FE0', '🌙', true),
    (new.id, 'O', 'Off Day',          null,    null,   false, '#4C9A6A', '⚪', true),
    (new.id, 'L', 'Leave',            null,    null,   false, '#C9A6E8', '🏖️', true),
    (new.id, 'S', 'Work Assignment', '08:00', '17:00', false, '#4AAFAE', '📍', true)
  on conflict do nothing;

  insert into public.alarm_rules (user_id, shift_code, label, minutes_before, kind)
  values
    (new.id, 'M', 'Wake-up alarm',        90, 'alarm'),
    (new.id, 'M', 'Leave-home reminder',  30, 'notification'),
    (new.id, 'M', 'Shift starts',          0, 'notification'),
    (new.id, 'N', 'Wake-up alarm',       120, 'alarm'),
    (new.id, 'N', 'Leave-home reminder',  30, 'notification'),
    (new.id, 'N', 'Shift starts',          0, 'notification');

  return new;
end $$;


drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.seed_defaults_for_user();