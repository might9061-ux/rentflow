-- 0043 — Google / Apple sign-in for MANAGERS.
--
-- Social sign-in is manager-only in RentLoja: tenants receive a temporary
-- password from their manager, and the app owner uses email. So any user who
-- arrives through an OAuth provider (google / apple) is a property-manager owner.
--
-- The existing on_auth_user_created trigger only created a manager profile when
-- the sign-up carried role='manager' metadata (the email/password flow). OAuth
-- users arrive with the provider's profile instead (full_name, given_name, …),
-- so here we ALSO create a manager profile for google/apple sign-ups, deriving
-- the name from whatever the provider supplied. The trigger itself is unchanged;
-- we just replace the function body.

create or replace function public.handle_new_manager()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_oauth boolean;
  full_nm  text;
  fname    text;
  lname    text;
begin
  is_oauth := coalesce(new.raw_app_meta_data ->> 'provider', '') in ('google', 'apple');

  -- Email/password sign-up (role='manager') OR any social sign-in → make an owner.
  if (new.raw_user_meta_data ->> 'role') = 'manager' or is_oauth then
    full_nm := coalesce(new.raw_user_meta_data ->> 'full_name',
                        new.raw_user_meta_data ->> 'name', '');
    fname := coalesce(
      nullif(new.raw_user_meta_data ->> 'first_name', ''),
      nullif(new.raw_user_meta_data ->> 'given_name', ''),
      nullif(split_part(full_nm, ' ', 1), ''),
      '');
    lname := coalesce(
      nullif(new.raw_user_meta_data ->> 'last_name', ''),
      nullif(new.raw_user_meta_data ->> 'family_name', ''),
      nullif(btrim(substr(full_nm, length(split_part(full_nm, ' ', 1)) + 1)), ''),
      '');

    begin
      insert into public.managers (id, first_name, last_name, email, phone)
      values (new.id, fname, lname, new.email, new.raw_user_meta_data ->> 'phone')
      on conflict (id) do nothing;
    exception when unique_violation then
      -- The email already belongs to another manager (e.g. they first signed up
      -- with a password). Leave it — they can sign in with the original method.
      null;
    end;
  end if;

  return new;
end $$;
