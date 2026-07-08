-- ═══════════════════════════════════════════════════════════════════════════
-- 0015 — fix credit on multiple / overpayments in the same period
-- Bug: approve_payment subtracted a full month's rent from EVERY payment, so a
-- second payment for an already-paid period lost its money instead of becoming
-- credit (e.g. two $500 payments for $500 rent → credit ended at $0, not $500).
-- Fix: look at what's already been paid toward this payment's period, only
-- require the remainder, and carry the rest forward as credit. (Also keeps the
-- 0014 tenant_status enum cast.)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.approve_payment(p_payment_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_pay        public.payments%rowtype;
  v_rent       numeric;
  v_credit     numeric;
  v_period_paid numeric;   -- already approved toward THIS payment's period
  v_needed     numeric;    -- of this payment, how much still covers the period
  v_new_credit numeric;
  v_covered    boolean;
  v_receipt    text;
begin
  select * into v_pay from public.payments where id = p_payment_id;
  if not found then raise exception 'Payment not found'; end if;
  if v_pay.manager_id <> auth.uid() then raise exception 'Not your payment'; end if;

  select rent, credit_balance into v_rent, v_credit
    from public.tenants where id = v_pay.tenant_id;

  -- Sum of OTHER already-approved payments applied to the same billing period.
  select coalesce(sum(amount), 0) into v_period_paid
    from public.payments
   where tenant_id = v_pay.tenant_id and status = 'approved'
     and id <> p_payment_id and period_from = v_pay.period_from;

  -- This payment first tops the period up to one month's rent; the rest (plus
  -- any existing credit) rolls forward as credit.
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
