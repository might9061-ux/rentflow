-- Give staff (agents) the same first-login + temp-password lifecycle tenants
-- already have. A newly-invited agent must set their own password before using
-- the app, which replaces the manager-issued TEMP-XXXX; the temp key is also
-- single-use and expires, so it can't linger in a WhatsApp chat forever.
--
-- Owners are unaffected: they self-register and set their own password, so
-- first_login defaults to false for every existing row.
alter table public.managers
  add column if not exists first_login              boolean not null default false,
  add column if not exists temp_password_issued_at  timestamptz,
  add column if not exists temp_password_used_at     timestamptz;

comment on column public.managers.first_login is
  'True for an invited agent until they set their own password on first sign-in.';
