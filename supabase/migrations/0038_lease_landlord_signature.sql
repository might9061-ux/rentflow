-- ═══════════════════════════════════════════════════════════════════════════
-- 0038 — landlord (manager) signature on leases
--
-- The manager can sign the lease as the landlord, in addition to the tenant's
-- e-signature. Both signatures then appear on the document.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.leases
  add column if not exists manager_signed_name text,
  add column if not exists manager_signed_at   timestamptz;
