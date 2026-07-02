-- ═══════════════════════════════════════════════════════════════════════════
-- RentFlow — 0010 Transaction fee
--
-- A 0.5% platform fee is added ON TOP of each tenant rent payment. The tenant
-- pays rent + fee; the manager receives the full rent (`amount`); the fee is
-- platform revenue surfaced in the admin dashboard. `fee` stores the charge.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.payments
  add column if not exists fee numeric(12,2) not null default 0;
