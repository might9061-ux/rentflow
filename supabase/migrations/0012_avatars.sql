-- ═══════════════════════════════════════════════════════════════════════════
-- RentFlow — 0012 Profile pictures
--
-- Managers, agents and tenants can set a profile picture. Stored here as a
-- small data URL for simplicity; in production this would be a Storage URL.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.managers add column if not exists avatar text;
alter table public.tenants  add column if not exists avatar text;
