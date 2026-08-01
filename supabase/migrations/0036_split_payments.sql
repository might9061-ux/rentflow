-- ═══════════════════════════════════════════════════════════════════════════
-- 0036 — Pesepay split payments (aggregator model)
--
-- Rent can flow through the PLATFORM's split-enabled Pesepay application, with
-- the landlord identified by their Pesepay merchant email (the "beneficiary").
-- Pesepay then settles the rent to the landlord and the platform's commission
-- (the 0.5% service fee) to the platform — automatically.
--
--   • payment_credentials.beneficiary_email — the landlord's Pesepay merchant
--     email. When set, their rent is collected via split (platform app) instead
--     of the landlord's own keys.
--   • payments.via_platform — this rent payment was taken on the platform app
--     (so status polling + the webhook verify it with the PLATFORM keys, not the
--     landlord's).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.payment_credentials
  add column if not exists beneficiary_email text;

alter table public.payments
  add column if not exists via_platform boolean not null default false;
