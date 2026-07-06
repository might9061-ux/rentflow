-- ═══════════════════════════════════════════════════════════════════════════
-- 0014 — fix approve_payment enum cast
-- The tenants.status column is the enum `tenant_status`, but the CASE in
-- approve_payment produced plain text ('paid'/'due'), so Postgres raised:
--   column "status" is of type tenant_status but expression is of type text
-- Cast the CASE result to tenant_status.
-- ═══════════════════════════════════════════════════════════════════════════

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
         status = (case when v_new_credit >= v_rent then 'paid'
                        when (v_credit + v_pay.amount) >= v_rent then 'paid'
                        else 'due' end)::tenant_status
   where id = v_pay.tenant_id;

  return v_receipt;
end $$;
