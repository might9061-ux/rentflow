-- ═══════════════════════════════════════════════════════════════════════════
-- RentFlow — 0008 Multi-country + late fees
--
-- A manager picks their COUNTRY, which drives the currency shown across the app
-- and the mobile-money methods tenants can use (resolved client-side from
-- markets.js). Plus an optional late-fee policy on overdue rent.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.managers
  add column if not exists country             text not null default 'ZW',     -- ISO-2 market code
  add column if not exists currency            text not null default 'USD',     -- primary (display) currency
  add column if not exists currencies          text[] not null default '{USD}', -- accepted currencies (one or both)
  add column if not exists late_fee_enabled    boolean not null default false,
  add column if not exists late_fee_type       text not null default 'flat',   -- 'flat' | 'percent'
  add column if not exists late_fee_amount      numeric(12,2) not null default 0,
  add column if not exists late_fee_grace_days  int not null default 3;
