-- 0049 — free-form extra details on a tenant.
--
-- Managers can attach whatever identifying details they need — National ID,
-- passport, student number, next of kin… — as label/value pairs, chosen by
-- them rather than a fixed set of columns.
alter table public.tenants
  add column if not exists details jsonb not null default '{}'::jsonb;

comment on column public.tenants.details is
  'Manager-defined label/value pairs (e.g. {"National ID": "63-123456A70"}).';
