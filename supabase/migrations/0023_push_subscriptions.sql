-- ═══════════════════════════════════════════════════════════════════════════
-- 0023 — Web Push subscriptions
--
-- One row per device that has allowed notifications, so the server can raise a
-- real pop-up on the phone (the same way WhatsApp or a bank app does) even when
-- RentLoja is closed. Without this a rent reminder only exists inside the app,
-- which nobody sees until they happen to open it.
--
-- The endpoint URL is issued by the browser's push service (FCM, Mozilla, etc.)
-- and is globally unique, so it is the primary key: re-subscribing the same
-- device updates its row instead of piling up duplicates.
--
-- user_id is an auth user — a tenant OR a manager; both sign in through
-- Supabase auth and both want reminders.
--
-- The keys here are per-device encryption material, not secrets of ours: they
-- can only be used to send a message TO that device. Still, a user may only see
-- and remove their own — you should not be able to enumerate other people's
-- devices, and one tenant must never be able to delete another's subscription
-- to silence their reminders.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.push_subscriptions (
  endpoint    text primary key,          -- push-service URL for this device
  user_id     uuid not null,             -- auth user id (manager OR tenant)
  p256dh      text not null,             -- device public key (payload encryption)
  auth        text not null,             -- device auth secret (payload encryption)
  user_agent  text,
  label       text,                      -- friendly, e.g. "Chrome on Android"
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  failed_at   timestamptz                -- set when the push service rejects it
);

create index if not exists idx_push_subs_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- See your own devices.
drop policy if exists push_subs_own_read on public.push_subscriptions;
create policy push_subs_own_read on public.push_subscriptions
  for select using (user_id = auth.uid());

-- Turn notifications off on a device you own. Writes go through the API with
-- the service role, so there is deliberately no insert/update policy: a client
-- cannot register a subscription against somebody else's user_id.
drop policy if exists push_subs_own_delete on public.push_subscriptions;
create policy push_subs_own_delete on public.push_subscriptions
  for delete using (user_id = auth.uid());
