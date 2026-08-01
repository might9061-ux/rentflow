-- ═══════════════════════════════════════════════════════════════════════════
-- 0037 — lease agreements
--
-- A manager can either GENERATE a lease from editable terms, or UPLOAD their own
-- lease file. It's stored, shown to the tenant in their portal, and the tenant
-- can e-sign it (typed-name acceptance). Both sides then see the signed copy.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.leases (
  id           uuid primary key default gen_random_uuid(),
  manager_id   uuid not null references public.managers(id)  on delete cascade,
  tenant_id    uuid not null references public.tenants(id)   on delete cascade,
  property_id  uuid references public.properties(id)         on delete set null,
  kind         text not null default 'generated',   -- 'generated' | 'uploaded'
  status       text not null default 'draft',        -- 'draft' | 'sent' | 'signed'
  -- generated terms
  rent         numeric(12,2),
  deposit      numeric(12,2),
  currency     text default 'USD',
  start_date   date,
  end_date     date,
  due_day      integer,
  term_months  integer,
  terms        text,                                 -- extra clauses (free text)
  -- uploaded document (data URL / stored file) + its name
  document_url text,
  file_name    text,
  -- e-signature (typed-name acceptance)
  signed_at    timestamptz,
  signed_name  text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);
create index if not exists idx_leases_manager on public.leases (manager_id);
create index if not exists idx_leases_tenant  on public.leases (tenant_id);

alter table public.leases enable row level security;

-- The workspace (owner + staff) has full control over its leases.
drop policy if exists leases_manager on public.leases;
create policy leases_manager on public.leases
  for all using (manager_id = public.workspace_owner())
  with check (manager_id = public.workspace_owner());

-- A tenant may READ their own lease. Signing is done through the API (service
-- role) so a tenant can only ever set the signature — never change the terms.
drop policy if exists leases_tenant_read on public.leases;
create policy leases_tenant_read on public.leases
  for select using (tenant_id = auth.uid());
