-- "Delete permanently" for a tenant, while keeping the payment history.
--
-- Payments are NOT NULL on tenant_id and cascade-delete with the tenant row, so
-- a hard delete would erase the manager's financial record of money received.
-- Instead we soft-delete: mark deleted_at, remove the login, and hide the tenant
-- from every roster — but keep the row so their approved payments stay in the
-- manager's Finances / totals, attributed to their name.
alter table public.tenants
  add column if not exists deleted_at timestamptz;

comment on column public.tenants.deleted_at is
  'When the tenant was permanently deleted. Hidden from all lists; row kept so their payment history survives.';
