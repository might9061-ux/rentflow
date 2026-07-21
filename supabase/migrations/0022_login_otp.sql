-- Mandatory emailed one-time code on every password sign-in (manager, staff,
-- platform admin, and tenant). Distinct from otp_codes (tenant first-login
-- channel verification) — this table brokers a login in progress: the API
-- verifies the password, then holds the real Supabase session tokens here
-- until the emailed code is confirmed, so a leaked password alone can never
-- produce a usable session.
create table if not exists public.login_challenges (
  id            uuid primary key default gen_random_uuid(),
  account_type  text not null check (account_type in ('manager','tenant')),
  account_id    uuid not null,
  email         text not null,
  code          text not null,
  access_token  text not null,
  refresh_token text not null,
  attempts      int not null default 0,
  consumed      boolean not null default false,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_login_challenges_account on public.login_challenges(account_id);
create index if not exists idx_login_challenges_expires on public.login_challenges(expires_at);

alter table public.login_challenges enable row level security;
-- No policies: this table holds live, unredeemed session tokens. Only the
-- service-role key (the API server) may ever touch it — never the browser,
-- not even the account it belongs to.
