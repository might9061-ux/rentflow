-- Vacating a tenant (they moved out).
--
-- When set, the tenancy is archived: the tenant is unassigned from their unit
-- (freeing it) and can no longer sign in, but the record and its payment history
-- are kept for reference until the manager chooses to delete them. Leaving it
-- null = an ordinary active tenant. Deleting the tenant row removes it outright.
alter table public.tenants
  add column if not exists vacated_at timestamptz;

comment on column public.tenants.vacated_at is
  'When the tenant moved out. Set = archived (record kept until deleted); null = active.';
