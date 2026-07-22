-- ═══════════════════════════════════════════════════════════════════════════
-- 0027 — give manager-issued temporary passwords a lifetime
--
-- Half of "one time only" already held: setting your own password calls
-- updateUser({password}), and Supabase Auth stores exactly one password, so the
-- TEMP-XXXX is genuinely replaced. Verified — it is rejected afterwards.
--
-- What did NOT hold: a temp password that is never used works forever, and
-- works any number of times. That password was typed by the manager and
-- usually sent over WhatsApp, so it sits in a chat log indefinitely — anyone
-- who scrolls back can sign in as that tenant. The emailed login code is the
-- backstop, but a shared credential with no expiry is still the wrong default.
--
-- Two timestamps are enough. Both NULL on existing rows, which deliberately
-- means "no restriction" so nobody already mid-setup is locked out.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.tenants
  add column if not exists temp_password_issued_at timestamptz,
  add column if not exists temp_password_used_at   timestamptz;

comment on column public.tenants.temp_password_issued_at is
  'When the manager-issued TEMP-XXXX was created. Expires it after a fixed window.';
comment on column public.tenants.temp_password_used_at is
  'First successful sign-in with that temp password. Makes it single-use.';
