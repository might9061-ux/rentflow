-- ═══════════════════════════════════════════════════════════════════════════
-- 0039 — shared accommodation
--
-- A property marked `shared` lets several tenants (roommates) occupy the same
-- unit/house, each with their own rent. When off, the usual one-tenant-per-unit
-- rule applies.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.properties
  add column if not exists shared boolean not null default false;
