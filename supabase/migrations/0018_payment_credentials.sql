-- ═══════════════════════════════════════════════════════════════════════════
-- 0018 — per-workspace payment gateway credentials (Paynow)
--
-- Rent is paid STRAIGHT TO THE LANDLORD: each manager connects their own
-- Paynow merchant account, so RentLoja never holds tenant money.
--
-- These live in their own table rather than on `managers` on purpose — the
-- `managers_visible_to_tenant` policy lets tenants read their manager's row
-- (that's how branding/currency reach the tenant portal), and an integration
-- key must never be readable by a tenant. Nothing here is exposed to tenants
-- at all; the API reads it with the service role when starting a payment.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.payment_credentials (
  manager_id      uuid primary key references public.managers(id) on delete cascade,
  provider        text not null default 'paynow',
  integration_id  text,
  integration_key text,                      -- SECRET: service-role reads only
  live            boolean not null default false,  -- off until the owner tests it
  updated_at      timestamptz not null default now()
);

alter table public.payment_credentials enable row level security;

-- Only the workspace OWNER may see or change their own gateway credentials.
-- (workspace_owner() resolves a staff manager to the owner they belong to.)
drop policy if exists payment_credentials_owner_select on public.payment_credentials;
create policy payment_credentials_owner_select on public.payment_credentials
  for select using (manager_id = public.workspace_owner());

drop policy if exists payment_credentials_owner_write on public.payment_credentials;
create policy payment_credentials_owner_write on public.payment_credentials
  for all using (manager_id = public.workspace_owner())
  with check (manager_id = public.workspace_owner());

-- Where to poll the gateway for this transaction's status.
alter table public.payments add column if not exists gateway_poll_url text;

-- Look up a pending online payment by its gateway reference (webhook path).
create index if not exists idx_payments_gateway_ref on public.payments (gateway_ref)
  where gateway_ref is not null;
