-- ═══════════════════════════════════════════════════════════════════════════
-- RentFlow — 0003 functions, triggers & RPC stubs
--
-- These back the "client-only" architecture: privileged work runs inside the
-- database as SECURITY DEFINER functions instead of a separate server.
--
-- NOTE on tenant auth accounts: creating a row in auth.users from SQL is not
-- officially supported. For production, deploy the Edge Function template in
-- supabase/functions/create-tenant/ which uses the service_role admin API.
-- The create_tenant() RPC below provisions the public.tenants profile row and
-- a temp password record; the Edge Function (or the demo mock) creates the
-- matching auth user. See README "Going to production".
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Auto-create a manager profile when a manager signs up ──────────────────
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_manager();

-- ── Receipt number generator ────────────────────────────────────────────────
create or replace function public.next_receipt_no()
returns text language plpgsql as $$
declare n bigint;
begin
  n := nextval('public.receipt_seq');
  return 'RF-' || to_char(now(), 'YYMM') || '-' || lpad(n::text, 5, '0');
end $$;

create sequence if not exists public.receipt_seq start 1001;

-- ── create_tenant : manager provisions a tenant profile ────────────────────
-- Returns the new tenant id. The temp password is generated client-side and
-- passed in (so it can be shown to the manager for the WhatsApp handoff).
create or replace function public.create_tenant(
  p_property_id  uuid,
  p_first_name   text,
  p_last_name    text,
  p_email        text,
  p_phone        text,
  p_unit         text,
  p_rent         numeric,
  p_due_day      int,
  p_lease_start  date,
  p_tenant_id    uuid default gen_random_uuid()
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_manager uuid := auth.uid();
  v_count   int;
  v_cap     int;
begin
  if v_manager is null then raise exception 'Not authenticated'; end if;

  -- Enforce plan capacity. No active plan ⇒ capacity 0 (must subscribe first).
  select count(*) into v_count from public.tenants where manager_id = v_manager;
  select case when plan_active then coalesce(plan_capacity, 0) else 0 end
    into v_cap from public.managers where id = v_manager;
  if v_count >= v_cap then
    raise exception 'Active plan required to add tenants (% of % used). Subscribe or upgrade your plan.', v_count, v_cap;
  end if;

  insert into public.tenants (
    id, manager_id, property_id, first_name, last_name, email, phone,
    unit, rent, due_day, lease_start, status, account_status,
    first_login, email_verified, phone_verified
  ) values (
    p_tenant_id, v_manager, p_property_id, p_first_name, p_last_name, lower(p_email), p_phone,
    p_unit, p_rent, p_due_day, p_lease_start, 'pending', 'pending_verification',
    true, false, false
  );

  return p_tenant_id;
end $$;

-- ── request_otp : "send" a 6-digit code (logged to table = SMS stub) ───────
create or replace function public.request_otp(p_tenant_id uuid, p_channel text)
returns void language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  -- invalidate previous codes for this channel
  update public.otp_codes set consumed = true
   where tenant_id = p_tenant_id and channel = p_channel and consumed = false;
  insert into public.otp_codes (tenant_id, channel, code, expires_at)
  values (p_tenant_id, p_channel, v_code, now() + interval '10 minutes');
  -- PRODUCTION: call Africa's Talking (SMS) or Supabase email here, e.g. via
  -- pg_net to an Edge Function. In the stub the code simply lives in the table.
  raise notice 'RentFlow OTP for % via %: %', p_tenant_id, p_channel, v_code;
end $$;

-- ── verify_otp : check a code and flip the verification flag ───────────────
create or replace function public.verify_otp(p_tenant_id uuid, p_channel text, p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_ok boolean;
begin
  select true into v_ok from public.otp_codes
   where tenant_id = p_tenant_id and channel = p_channel and code = p_code
     and consumed = false and expires_at > now()
   limit 1;

  if v_ok is not true then return false; end if;

  update public.otp_codes set consumed = true
   where tenant_id = p_tenant_id and channel = p_channel and code = p_code;

  if p_channel = 'email' then
    update public.tenants set email_verified = true where id = p_tenant_id;
  else
    update public.tenants set phone_verified = true where id = p_tenant_id;
  end if;

  return true;
end $$;

-- ── complete_first_login : clear firstLogin + activate account ─────────────
create or replace function public.complete_first_login(p_tenant_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.tenants
     set first_login = false,
         account_status = 'active',
         status = case when status = 'pending' then 'due' else status end
   where id = p_tenant_id;
end $$;

-- ── approve_payment : apply advance/credit logic, assign receipt ───────────
create or replace function public.approve_payment(p_payment_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_pay   public.payments%rowtype;
  v_rent  numeric;
  v_credit numeric;
  v_new_credit numeric;
  v_receipt text;
begin
  select * into v_pay from public.payments where id = p_payment_id;
  if not found then raise exception 'Payment not found'; end if;
  if v_pay.manager_id <> auth.uid() then raise exception 'Not your payment'; end if;

  select rent, credit_balance into v_rent, v_credit
    from public.tenants where id = v_pay.tenant_id;

  -- Effective funds available this cycle = existing credit + this payment.
  -- Whatever exceeds one month's rent rolls forward as new credit.
  v_new_credit := greatest(0, (v_credit + v_pay.amount) - v_rent);
  v_receipt := public.next_receipt_no();

  update public.payments
     set status = 'approved',
         receipt_no = v_receipt,
         is_advance = (v_new_credit > 0),
         credit_amount = v_new_credit,
         approved_at = now()
   where id = p_payment_id;

  update public.tenants
     set total_paid = total_paid + v_pay.amount,
         credit_balance = v_new_credit,
         status = case when v_new_credit >= v_rent then 'paid'
                       when (v_credit + v_pay.amount) >= v_rent then 'paid'
                       else 'due' end
   where id = v_pay.tenant_id;

  return v_receipt;
end $$;

-- ── reject_payment ──────────────────────────────────────────────────────────
create or replace function public.reject_payment(p_payment_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.payments
     set status = 'rejected', rejected_reason = p_reason
   where id = p_payment_id and manager_id = auth.uid();
end $$;

-- ── mark_notification_read ──────────────────────────────────────────────────
create or replace function public.mark_notification_read(p_notification_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notification_reads (notification_id, tenant_id)
  values (p_notification_id, auth.uid())
  on conflict do nothing;
end $$;
