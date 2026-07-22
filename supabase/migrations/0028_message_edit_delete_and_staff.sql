-- ═══════════════════════════════════════════════════════════════════════════
-- 0028 — edit/delete messages, and let owners message their agents
--
-- This deliberately reverses part of 0024, which gave messages no UPDATE or
-- DELETE policy on the grounds that "a sent message is a record".
--
-- That still matters — a landlord/tenant conversation can end up being the
-- evidence in a rent dispute — so this follows WhatsApp rather than a raw
-- delete: an edit is marked as edited, and a delete leaves a tombstone reading
-- "This message was deleted" instead of erasing history. Both sides can always
-- see that something was said and changed. Silently vanishing messages would
-- let either party rewrite the record after the fact.
--
-- Neither UPDATE nor DELETE is granted on the table. Both go through
-- SECURITY DEFINER functions that check auth.uid() against the message's own
-- sender_id — the check that complete_first_login() was missing, which let one
-- tenant alter another landlord's data (see 0026).
--
-- Owner ↔ agent conversations reuse the same table: manager_id stays the
-- workspace owner, and the counterparty is either a tenant or a staff manager.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.messages
  add column if not exists edited_at  timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists staff_id   uuid references public.managers(id) on delete cascade;

-- A conversation now has exactly one counterparty: a tenant OR a staff member.
alter table public.messages alter column tenant_id drop not null;

do $$ begin
  alter table public.messages add constraint messages_one_counterparty
    check ((tenant_id is not null) <> (staff_id is not null));
exception when duplicate_object then null; end $$;

-- 'staff' joins the allowed senders.
do $$ begin
  alter table public.messages drop constraint if exists messages_sender_role_check;
  alter table public.messages add constraint messages_sender_role_check
    check (sender_role in ('tenant', 'manager', 'staff'));
exception when duplicate_object then null; end $$;

create index if not exists idx_messages_staff on public.messages (staff_id, created_at);

-- ── Agent (staff) side of a conversation with their owner ──────────────────
drop policy if exists messages_staff_read on public.messages;
create policy messages_staff_read on public.messages
  for select using (staff_id = auth.uid());

drop policy if exists messages_staff_send on public.messages;
create policy messages_staff_send on public.messages
  for insert with check (
    staff_id = auth.uid()
    and sender_role = 'staff'
    and sender_id = auth.uid()
    and manager_id = public.workspace_owner()
  );

-- ── Owner writing into a staff conversation ────────────────────────────────
-- Staff threads are between the OWNER and that agent, so unlike tenant threads
-- they are not visible to other staff.
drop policy if exists messages_owner_staff_thread on public.messages;
create policy messages_owner_staff_thread on public.messages
  for select using (staff_id is not null and manager_id = auth.uid());

drop policy if exists messages_owner_staff_send on public.messages;
create policy messages_owner_staff_send on public.messages
  for insert with check (
    staff_id is not null
    and manager_id = auth.uid()
    and sender_role = 'manager'
    and sender_id = auth.uid()
    and exists (select 1 from public.managers s where s.id = staff_id and s.owner_id = auth.uid())
  );

-- ── Edit ───────────────────────────────────────────────────────────────────
-- Your own message, for a short window, and the fact that it changed is kept.
create or replace function public.edit_message(p_id uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare m public.messages;
begin
  select * into m from public.messages where id = p_id;
  if not found then raise exception 'Message not found'; end if;
  if auth.uid() is null or m.sender_id <> auth.uid() then
    raise exception 'You can only edit your own messages' using errcode = '42501';
  end if;
  if m.deleted_at is not null then raise exception 'That message was deleted'; end if;
  if now() - m.created_at > interval '15 minutes' then
    raise exception 'Messages can only be edited for 15 minutes after sending';
  end if;
  if length(btrim(p_body)) = 0 then raise exception 'Message cannot be empty'; end if;

  update public.messages
     set body = left(btrim(p_body), 4000), edited_at = now()
   where id = p_id;
end $$;

revoke execute on function public.edit_message(uuid, text) from anon;

-- ── Delete ─────────────────────────────────────────────────────────────────
-- Tombstone, not erasure: the row stays so the other side still sees that a
-- message existed here. No time limit — WhatsApp allows deleting for everyone
-- long after sending, and hiding your own words is less dangerous than being
-- able to make them disappear without trace.
create or replace function public.delete_message(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.messages;
begin
  select * into m from public.messages where id = p_id;
  if not found then raise exception 'Message not found'; end if;
  if auth.uid() is null or m.sender_id <> auth.uid() then
    raise exception 'You can only delete your own messages' using errcode = '42501';
  end if;

  update public.messages set deleted_at = now(), body = '' where id = p_id;
end $$;

revoke execute on function public.delete_message(uuid) from anon;

-- ── Mark read: teach it about staff threads ────────────────────────────────
-- p_tenant_id is really "the other party's id" now; kept for compatibility.
create or replace function public.mark_messages_read(p_tenant_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  -- The tenant (or agent) reading their own conversation.
  if auth.uid() = p_tenant_id then
    update public.messages
       set read_by_tenant = true
     where (tenant_id = p_tenant_id or staff_id = p_tenant_id)
       and sender_role = 'manager' and read_by_tenant = false;
    return;
  end if;

  v_owner := public.workspace_owner();

  -- The manager reading a tenant conversation.
  if exists (select 1 from public.tenants t where t.id = p_tenant_id and t.manager_id = v_owner) then
    update public.messages
       set read_by_manager = true
     where tenant_id = p_tenant_id and sender_role = 'tenant' and read_by_manager = false;
    return;
  end if;

  -- The owner reading a conversation with one of their agents.
  if exists (select 1 from public.managers s where s.id = p_tenant_id and s.owner_id = v_owner) then
    update public.messages
       set read_by_manager = true
     where staff_id = p_tenant_id and sender_role = 'staff' and read_by_manager = false;
  end if;
end $$;
