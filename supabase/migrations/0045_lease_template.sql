-- 0045 — custom lease template.
--
-- A manager can write their OWN lease wording once, with {{placeholders}}
-- (tenant name, rent, dates…). It's stored here on the owner's row; when they
-- create a lease for a tenant, the gaps are filled in from that tenant's
-- details. One template per workspace.
alter table public.managers
  add column if not exists lease_template text;

comment on column public.managers.lease_template is
  'Custom lease wording with {{placeholders}}, filled per tenant when creating a lease.';
