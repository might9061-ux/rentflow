-- 0044 — revert 0043. Social sign-in was removed, so restore the original
-- handle_new_manager() that ONLY creates a manager profile for email/password
-- sign-ups (role='manager'). Without this, an OAuth user (if the provider were
-- still enabled) would keep getting an owner profile.

create or replace function public.handle_new_manager()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Only create a profile when the signup carried manager metadata.
  if (new.raw_user_meta_data ->> 'role') = 'manager' then
    insert into public.managers (id, first_name, last_name, email, phone)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'first_name', ''),
      coalesce(new.raw_user_meta_data ->> 'last_name', ''),
      new.email,
      new.raw_user_meta_data ->> 'phone'
    )
    on conflict (id) do nothing;
  end if;
  return new;
end $$;
