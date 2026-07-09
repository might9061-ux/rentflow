-- ═══════════════════════════════════════════════════════════════════════════
-- 0016 — make approve_payment idempotent
-- Bug: approving the same payment twice (double-click / re-approve) ran the
-- whole routine again, adding total_paid + credit a second time (e.g. $1400 in
-- payments showed as $2800 paid, $1800 credit). Guard: if the payment is
-- already approved, just return its receipt and change nothing. (Keeps the 0015
-- credit-distribution logic and the tenant_status cast.)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.approve_payment(p_payment_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_pay        public.payments%rowtype;
  v_rent       numeric;
  v_credit     numeric;
  v_period_paid numeric;
  v_needed     numeric;
  v_new_credit numeric;
  v_covered    boolean;
  v_receipt    text;
begin
  select * into v_pay from public.payments where id = p_payment_id;
  if not found then raise exception 'Payment not found'; end if;
  if v_pay.manager_id <> auth.uid() then raise exception 'Not your payment'; end if;

  -- Already approved → do nothing (idempotent). Prevents double-counting.
  if v_pay.status = 'approved' then return v_pay.receipt_no; end if;

  select rent, credit_balance into v_rent, v_credit
    from public.tenants where id = v_pay.tenant_id;

  select coalesce(sum(amount), 0) into v_period_paid
    from public.payments
   where tenant_id = v_pay.tenant_id and status = 'approved'
     and id <> p_payment_id and period_from = v_pay.period_from;

  v_needed     := greatest(0, v_rent - v_period_paid);
  v_new_credit := v_credit + greatest(0, v_pay.amount - v_needed);
  v_covered    := (v_period_paid + v_pay.amount) >= v_rent or v_new_credit > 0;
  v_receipt    := public.next_receipt_no();

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
         status = (case when v_covered then 'paid' else 'due' end)::tenant_status
   where id = v_pay.tenant_id;

  return v_receipt;
end $$;
