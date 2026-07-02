-- ═══════════════════════════════════════════════════════════════════════════
-- RentFlow — 0007 Maintenance / repair requests
--
-- Tenants log repair requests (with a photo); managers triage, assign a
-- caretaker, set a cost and resolve them. A resolved request with a cost is
-- mirrored into the expenses ledger so per-property P&L stays accurate.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.maintenance (
  id             uuid primary key default gen_random_uuid(),
  manager_id     uuid not null references public.managers(id) on delete cascade,   -- workspace owner
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  property_id    uuid references public.properties(id) on delete set null,
  unit           text,
  title          text not null,
  category       text not null default 'General',
  description    text,
  photo_url      text,
  priority       text not null default 'normal',   -- 'normal' | 'urgent'
  status         text not null default 'open',      -- 'open' | 'in_progress' | 'resolved'
  cost           numeric(12,2) not null default 0,
  manager_note   text,
  caretaker_name text,
  expense_logged boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  resolved_at    timestamptz
);

create index if not exists idx_maintenance_manager on public.maintenance(manager_id, status);
create index if not exists idx_maintenance_tenant  on public.maintenance(tenant_id, created_at desc);

alter table public.maintenance enable row level security;

-- Tenants see and create their own requests.
create policy maintenance_tenant_select on public.maintenance for select using (tenant_id = auth.uid());
create policy maintenance_tenant_insert on public.maintenance for insert with check (tenant_id = auth.uid());

-- A manager (owner or assigned staff) sees and updates the workspace's requests.
create policy maintenance_manager_select on public.maintenance for select
  using (manager_id = auth.uid()
    or manager_id = (select owner_id from public.managers where id = auth.uid()));
create policy maintenance_manager_update on public.maintenance for update
  using (manager_id = auth.uid()
    or manager_id = (select owner_id from public.managers where id = auth.uid()));

-- ── Resolved repair → expense (with full detail) ────────────────────────────
-- Link expenses back to the request that created them.
alter table public.expenses
  add column if not exists maintenance_id uuid references public.maintenance(id) on delete set null;

-- When a request is resolved with a cost (and hasn't been logged yet), mirror it
-- into the expenses ledger with what/category/unit/tenant/caretaker in the note.
create or replace function public.log_maintenance_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_note text;
begin
  if NEW.status = 'resolved' and NEW.cost > 0 and not NEW.expense_logged then
    select nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
      into v_name from public.tenants where id = NEW.tenant_id;
    v_note := 'Repair: ' || NEW.title || ' (' || NEW.category
      || case when coalesce(NEW.unit, '') <> '' then ', Unit ' || NEW.unit else '' end
      || case when v_name is not null then ', ' || v_name else '' end || ')'
      || case when coalesce(NEW.caretaker_name, '') <> '' then ' · by ' || NEW.caretaker_name else '' end;
    insert into public.expenses (manager_id, property_id, category, amount, spent_on, note, maintenance_id)
      values (NEW.manager_id, NEW.property_id, 'Maintenance', NEW.cost, current_date, v_note, NEW.id);
    NEW.expense_logged := true;
    if NEW.resolved_at is null then NEW.resolved_at := now(); end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_log_maintenance_expense on public.maintenance;
create trigger trg_log_maintenance_expense
  before update on public.maintenance
  for each row execute function public.log_maintenance_expense();
