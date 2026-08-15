-- 0050 — messages can only be deleted for 24 hours after sending.
--
-- Delete stays a tombstone (the other side still sees a message existed), but
-- it now closes after a day: these conversations can end up as evidence in a
-- rent dispute, so old history should stop being erasable at some point.
create or replace function public.delete_message(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.messages;
begin
  select * into m from public.messages where id = p_id;
  if not found then raise exception 'Message not found'; end if;
  if auth.uid() is null or m.sender_id <> auth.uid() then
    raise exception 'You can only delete your own messages' using errcode = '42501';
  end if;
  if now() - m.created_at > interval '24 hours' then
    raise exception 'Messages can only be deleted for 24 hours after sending';
  end if;

  update public.messages set deleted_at = now(), body = '' where id = p_id;
end $$;

revoke execute on function public.delete_message(uuid) from anon;
