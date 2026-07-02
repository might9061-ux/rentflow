-- ═══════════════════════════════════════════════════════════════════════════
-- RentFlow — 0004 Team / multi-manager Row Level Security
--
-- The 0002 policies scoped everything by `manager_id = auth.uid()`. With the
-- Team feature, all workspace data is stored under the OWNER's id, and STAFF
-- managers (managers.role = 'staff', managers.owner_id = <owner>) must see only
-- the properties listed in their managers.assigned_property_ids — and the
-- tenants / payments / expenses inside those.
--
-- These helpers + policies enforce, server-side:
--   • cross-OWNER isolation  — one workspace can never read another's rows
--   • per-property staff scope — staff see only their assigned buildings
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Helpers (SECURITY DEFINER so they can read `managers` without recursing
--    through that table's own RLS) ──────────────────────────────────────────
create or replace function public.workspace_owner()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce((select owner_id from public.managers where id = auth.uid()), auth.uid());
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'staff' from public.managers where id = auth.uid()), false);
$$;

create or replace function public.staff_property_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce((select assigned_property_ids from public.managers where id = auth.uid()), '{}'::uuid[]);
$$;

-- A property is in the caller's scope when it belongs to their workspace and,
-- for staff, is one of their assigned properties.
create or replace function public.can_access_property(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.properties p
    where p.id = pid
      and p.manager_id = public.workspace_owner()
      and (not public.is_staff() or p.id = any(public.staff_property_ids()))
  );
$$;

-- ── managers ────────────────────────────────────────────────────────────────
-- Owners can read & manage their own staff rows (the Team page).
drop policy if exists managers_owner_team on public.managers;
create policy managers_owner_team on public.managers
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Prevent a STAFF member from escalating their own access by editing the
-- privileged columns (role / owner_id / assigned_property_ids) on their row.
create or replace function public.guard_manager_self_update()
returns trigger language plpgsql as $$
begin
  if auth.uid() = new.id
     and coalesce(old.role, 'owner') = 'staff'
     and (new.role is distinct from old.role
       or new.owner_id is distinct from old.owner_id
       or new.assigned_property_ids is distinct from old.assigned_property_ids
       or new.account_status is distinct from old.account_status) then
    raise exception 'Staff cannot change their own role, owner or property assignments';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_manager_self_update on public.managers;
create trigger trg_guard_manager_self_update
  before update on public.managers
  for each row execute function public.guard_manager_self_update();

-- ── properties ──────────────────────────────────────────────────────────────
drop policy if exists properties_manager on public.properties;
create policy properties_workspace on public.properties
  for all using (
    manager_id = public.workspace_owner()
    and (not public.is_staff() or id = any(public.staff_property_ids()))
  ) with check (manager_id = public.workspace_owner());

-- ── tenants ─────────────────────────────────────────────────────────────────
drop policy if exists tenants_manager on public.tenants;
create policy tenants_workspace on public.tenants
  for all using (
    manager_id = public.workspace_owner()
    and (not public.is_staff() or (property_id is not null and property_id = any(public.staff_property_ids())))
  ) with check (manager_id = public.workspace_owner());

-- ── payments ────────────────────────────────────────────────────────────────
drop policy if exists payments_manager on public.payments;
create policy payments_workspace on public.payments
  for all using (
    manager_id = public.workspace_owner()
    and (not public.is_staff() or tenant_id in (
      select id from public.tenants
      where property_id is not null and property_id = any(public.staff_property_ids())
    ))
  ) with check (manager_id = public.workspace_owner());

-- ── notifications ───────────────────────────────────────────────────────────
drop policy if exists notifications_manager on public.notifications;
create policy notifications_workspace on public.notifications
  for all using (
    manager_id = public.workspace_owner()
    and (not public.is_staff()
      or recipient_scope = 'all'
      or (property_id is not null and property_id = any(public.staff_property_ids())))
  ) with check (manager_id = public.workspace_owner());

-- ── expenses ────────────────────────────────────────────────────────────────
drop policy if exists expenses_manager on public.expenses;
create policy expenses_workspace on public.expenses
  for all using (
    manager_id = public.workspace_owner()
    and (not public.is_staff() or (property_id is not null and property_id = any(public.staff_property_ids())))
  ) with check (manager_id = public.workspace_owner());

-- ── subscription_payments (billing) — OWNER only, never staff ───────────────
drop policy if exists sub_payments_manager on public.subscription_payments;
create policy sub_payments_owner on public.subscription_payments
  for all using (manager_id = auth.uid() and not public.is_staff())
  with check (manager_id = auth.uid() and not public.is_staff());

-- Note: tenant-side read policies from 0002 (tenants_self_read, payments_tenant_*,
-- notifications_tenant_read, managers_visible_to_tenant) are unchanged — tenants
-- still relate to their workspace via tenants.manager_id = owner id.
