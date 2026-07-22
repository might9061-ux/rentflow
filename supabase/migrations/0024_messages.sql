-- ═══════════════════════════════════════════════════════════════════════════
-- 0024 — direct messages between a tenant and their property manager
--
-- The Copilot answers from data, so it can only ever answer what the data
-- contains. When a tenant asks something it genuinely cannot know — "can I pay
-- late this month", "the geyser is leaking again" — the honest next step is a
-- human, and until now the app had nowhere to send them: tenant_questions only
-- logs AI Q&A one way, with no reply and no read-back for the tenant.
--
-- One conversation per tenant. No threads, no subjects: a tenant has exactly
-- one manager, so a subject line would be ceremony with no purpose.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  manager_id      uuid not null references public.managers(id) on delete cascade,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  sender_role     text not null check (sender_role in ('tenant', 'manager')),
  sender_id       uuid not null,          -- who actually typed it (staff have own ids)
  body            text not null,
  -- Set when the message came from the Copilot's "ask your manager" escalation,
  -- so the manager sees what was already tried and doesn't repeat the answer.
  from_assistant  boolean not null default false,
  read_by_tenant  boolean not null default false,
  read_by_manager boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists idx_messages_thread on public.messages (tenant_id, created_at);
create index if not exists idx_messages_manager on public.messages (manager_id, created_at desc);

alter table public.messages enable row level security;

-- ── Tenant ─────────────────────────────────────────────────────────────────
-- Reads their own conversation and writes into it. sender_role/sender_id are
-- pinned in the check so a tenant cannot forge a message that appears to come
-- from their manager (which would be a convincing way to fake, say, permission
-- to pay late).
drop policy if exists messages_tenant_read on public.messages;
create policy messages_tenant_read on public.messages
  for select using (tenant_id = auth.uid());

drop policy if exists messages_tenant_send on public.messages;
create policy messages_tenant_send on public.messages
  for insert with check (
    tenant_id = auth.uid()
    and sender_role = 'tenant'
    and sender_id = auth.uid()
  );

-- ── Manager ────────────────────────────────────────────────────────────────
-- The workspace owner sees every conversation; staff only the tenants in the
-- properties they're assigned, matching how they see tenants everywhere else.
drop policy if exists messages_manager on public.messages;
create policy messages_manager on public.messages
  for select using (
    manager_id = public.workspace_owner()
    and (not public.is_staff() or exists (
      select 1 from public.tenants t
      where t.id = messages.tenant_id and t.property_id = any(public.staff_property_ids())
    ))
  );

drop policy if exists messages_manager_send on public.messages;
create policy messages_manager_send on public.messages
  for insert with check (
    manager_id = public.workspace_owner()
    and sender_role = 'manager'
    and sender_id = auth.uid()
    and (not public.is_staff() or exists (
      select 1 from public.tenants t
      where t.id = messages.tenant_id and t.property_id = any(public.staff_property_ids())
    ))
  );

-- Nobody gets an UPDATE or DELETE policy: a sent message is a record. Marking
-- it read goes through the function below, which can only touch the read flags.

-- ── Mark a conversation read ───────────────────────────────────────────────
-- SECURITY DEFINER so it can write the read flag without opening up UPDATE on
-- the table (which would let either side rewrite the other's words). It flips
-- only the flag belonging to whoever is calling, and only for messages the
-- OTHER side sent.
create or replace function public.mark_messages_read(p_tenant_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  if auth.uid() = p_tenant_id then
    update public.messages
       set read_by_tenant = true
     where tenant_id = p_tenant_id and sender_role = 'manager' and read_by_tenant = false;
    return;
  end if;

  -- Otherwise the caller must manage this tenant's workspace.
  v_owner := public.workspace_owner();
  if exists (select 1 from public.tenants t where t.id = p_tenant_id and t.manager_id = v_owner) then
    update public.messages
       set read_by_manager = true
     where tenant_id = p_tenant_id and sender_role = 'tenant' and read_by_manager = false;
  end if;
end $$;
