-- ═══════════════════════════════════════════════════════════════════════════
-- 0041 — monthly vs yearly billing cycle for a manager's plan
--
-- plan_price stays the MONTHLY tier price; the cycle decides how much is charged
-- per installment (yearly = 12 × monthly) and when the next one is due.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.managers
  add column if not exists plan_cycle text not null default 'monthly';

-- Carry the chosen cycle on a gateway subscription charge, so activation knows
-- which cycle was paid for.
alter table public.subscription_payments
  add column if not exists plan_cycle text;
