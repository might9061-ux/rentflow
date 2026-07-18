-- ═══════════════════════════════════════════════════════════════════════════
-- 0019 — managers cannot grant themselves privileges or a paid plan
--
-- SECURITY FIX. Before this, an ordinary manager could update their own row
-- and set:
--   • platform_admin = true  → full access to the App-owner console (every
--     workspace, all revenue, every user) — privilege escalation;
--   • plan_active / plan_capacity / plan_price → a free unlimited plan.
--
-- Fixing only the API is not enough: the anon key ships in the browser bundle,
-- so anyone can call PostgREST directly with their own token. The guard
-- therefore lives in the database, where every path has to go through it.
--
-- Trusted callers still pass:
--   • the service role (our API server, migrations, admin tooling);
--   • a platform admin (that IS the admin console's job).
-- For everyone else the protected columns are silently pinned to their
-- previous values, so a malicious update succeeds but changes nothing.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.guard_manager_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  caller_is_admin boolean;
begin
  -- The service role is our own trusted server-side code.
  if jwt_role = 'service_role' then
    return new;
  end if;

  -- A platform admin may legitimately set these (activating a workspace).
  select coalesce(m.platform_admin, false)
    into caller_is_admin
    from public.managers m
   where m.id = auth.uid();

  if coalesce(caller_is_admin, false) then
    return new;
  end if;

  -- Everyone else: billing and privilege are never self-serve.
  new.platform_admin  := old.platform_admin;
  new.plan_active     := old.plan_active;
  new.plan_capacity   := old.plan_capacity;
  new.plan_price      := old.plan_price;
  new.plan_started_at := old.plan_started_at;

  return new;
end;
$$;

drop trigger if exists trg_guard_manager_privileged on public.managers;
create trigger trg_guard_manager_privileged
  before update on public.managers
  for each row execute function public.guard_manager_privileged_columns();
