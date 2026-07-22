-- ═══════════════════════════════════════════════════════════════════════════
-- 0026 — two fixes around first login
--
-- (1) SECURITY: complete_first_login() trusted its argument.
--
-- It is SECURITY DEFINER, took any tenant id, and never checked the caller had
-- anything to do with that tenant. Verified exploitable: a tenant in a
-- completely unrelated workspace called it on a SUSPENDED tenant and flipped
-- them to active with status 'due' — i.e. a tenant suspended for non-payment
-- could reactivate themselves, or anyone could quietly alter another
-- landlord's books.
--
-- A SECURITY DEFINER function runs as its owner, so RLS does not protect it.
-- The argument has to be checked in the body; there is nowhere else.
--
-- (2) BUG: resetting your password left you stuck on "Set your password".
--
-- first_login was only ever cleared by the first-login screen. A tenant who
-- used "forgot password" instead set a real password, signed in, verified with
-- the emailed code — and was then shown "Set your password" again, because the
-- flag was still true. finish_password_reset() closes that loop.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (1) Pin the argument to the caller ─────────────────────────────────────
create or replace function public.complete_first_login(p_tenant_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- The only legitimate caller is the tenant finishing their own first login.
  if auth.uid() is null or auth.uid() <> p_tenant_id then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.tenants
     set first_login = false,
         account_status = 'active',
         status = case when status = 'pending' then 'due' else status end
   where id = p_tenant_id;
end $$;

-- Signed-out callers have no auth.uid() and would fail the check anyway, but
-- there is no reason for anon to hold EXECUTE at all.
revoke execute on function public.complete_first_login(uuid) from anon;

-- ── (2) Finish a password reset ────────────────────────────────────────────
-- Takes no argument on purpose: it acts on whoever is calling, so it cannot be
-- pointed at another account the way the function above could.
--
-- Safe to run for a manager or an unknown caller — it simply matches no row.
--
-- email_verified is set because reaching here required clicking a link sent to
-- that address, which is the same proof the first-login flow asks for.
create or replace function public.finish_password_reset()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  update public.tenants
     set first_login = false,
         email_verified = true,
         account_status = case when account_status = 'pending_verification'
                               then 'active' else account_status end,
         status = case when status = 'pending' then 'due' else status end
   where id = auth.uid();
end $$;

revoke execute on function public.finish_password_reset() from anon;
