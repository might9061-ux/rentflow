-- ═══════════════════════════════════════════════════════════════════════════
-- 0040 — shared-unit capacity
--
-- For a shared property, how many roommates may occupy each unit/house. Adding a
-- tenant beyond this is blocked, the same way a non-shared unit blocks a second
-- tenant. Null/0 = no set limit.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.properties
  add column if not exists shared_capacity integer;
