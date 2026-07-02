-- ═══════════════════════════════════════════════════════════════════════════
-- RentFlow — 0005 Login helpers
--
-- Sign-in accepts EITHER a phone number or an email. Supabase auth needs an
-- email, so this resolves a phone to the matching account email. Phones are
-- compared on their last 9 significant digits so local (077…), country-code
-- (26377…) and formatted (+263 77 …) inputs all match.
--
-- SECURITY DEFINER + a tight body so it only ever returns an email string,
-- never any other column; granted to anon so it can run before authentication.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.email_for_login(p_phone text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with d as (select right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9) as tail)
  select m.email from public.managers m, d
    where length(d.tail) >= 7
      and right(regexp_replace(coalesce(m.phone, ''), '\D', '', 'g'), 9) = d.tail
  union
  select t.email from public.tenants t, d
    where length(d.tail) >= 7
      and right(regexp_replace(coalesce(t.phone, ''), '\D', '', 'g'), 9) = d.tail
  limit 1;
$$;

grant execute on function public.email_for_login(text) to anon, authenticated;
