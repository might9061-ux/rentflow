-- ═══════════════════════════════════════════════════════════════════════════
-- 0021 — known sign-in devices
--
-- Remembers which devices an account has signed in from, so a sign-in from a
-- NEW one can trigger an alert email. Without this we'd either email on every
-- single login (noise people learn to ignore) or never (no warning at all when
-- someone else gets in).
--
-- Written only by the API with the service role. A user may READ their own
-- devices; nobody can write through the app, so an intruder can't quietly mark
-- their own device as already-known.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.login_devices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,           -- auth user id (manager OR tenant)
  device_hash text not null,           -- fingerprint of user-agent + platform
  user_agent  text,
  label       text,                    -- friendly, e.g. "Chrome on Android"
  ip          text,
  location    text,                    -- approximate, e.g. "Harare, Zimbabwe"
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  unique (user_id, device_hash)
);

create index if not exists idx_login_devices_user on public.login_devices (user_id, last_seen desc);

alter table public.login_devices enable row level security;

-- Read your own devices. No write policies: only the service role records them.
drop policy if exists login_devices_own_read on public.login_devices;
create policy login_devices_own_read on public.login_devices
  for select using (user_id = auth.uid());
