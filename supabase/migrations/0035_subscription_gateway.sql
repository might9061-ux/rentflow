-- ═══════════════════════════════════════════════════════════════════════════
-- 0035 — subscription payments through the gateway (Pesepay → platform account)
--
-- Adds the pending/confirmed state a real charge needs. Existing rows were all
-- recorded as already-paid, so they default to 'approved'; only new gateway
-- charges start 'pending' and flip to 'approved' when Pesepay confirms.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.subscription_payments
  add column if not exists status           text not null default 'approved',
  add column if not exists capacity         integer,
  add column if not exists gateway_ref      text,
  add column if not exists gateway_poll_url text;

-- Look up a pending subscription charge by its gateway reference (webhook path).
create index if not exists idx_sub_payments_gateway_ref
  on public.subscription_payments (gateway_ref)
  where gateway_ref is not null;
