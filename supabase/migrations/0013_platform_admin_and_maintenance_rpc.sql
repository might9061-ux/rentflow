-- ═══════════════════════════════════════════════════════════════════════════
-- RentFlow — 0013 Platform-admin flag + create_maintenance RPC
--
-- Two gaps the earlier migrations never defined but the app relies on:
--   1. managers.platform_admin — marks the RentFlow HQ (app-owner) account that
--      sees cross-workspace subscriptions/revenue instead of a workspace.
--   2. create_maintenance() — lets a tenant log a repair request while the
--      manager_id / property_id / unit are derived from their own row (so the
--      client can't spoof another workspace).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Platform-admin flag ------------------------------------------------------
alter table public.managers
  add column if not exists platform_admin boolean not null default false;

-- 2. create_maintenance RPC ---------------------------------------------------
create or replace function public.create_maintenance(
  p_title       text,
  p_category    text default 'General',
  p_description text default '',
  p_photo_url   text default null,
  p_priority    text default 'normal'
) returns public.maintenance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t   public.tenants;
  v_row public.maintenance;
begin
  select * into v_t from public.tenants where id = auth.uid();
  if v_t.id is null then
    raise exception 'Only a tenant can create a maintenance request';
  end if;

  insert into public.maintenance
    (tenant_id, manager_id, property_id, unit, title, category, description, photo_url, priority, status)
  values
    (v_t.id, v_t.manager_id, v_t.property_id, v_t.unit,
     p_title, coalesce(p_category, 'General'), coalesce(p_description, ''),
     p_photo_url, coalesce(p_priority, 'normal'), 'open')
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.create_maintenance(text, text, text, text, text) to authenticated;
