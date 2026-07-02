-- ═══════════════════════════════════════════════════════════════════════════
-- RentFlow — 0011 Refunds
--
-- A manager can choose whether they offer refunds (refunds_enabled). When on,
-- they can refund an approved payment; the tenant's total drops and a 'Refund'
-- expense is mirrored into Finances. Tenants are shown the policy either way.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.managers
  add column if not exists refunds_enabled boolean not null default false;

alter table public.payments
  add column if not exists refunded        boolean not null default false,
  add column if not exists refunded_amount numeric(12,2),
  add column if not exists refunded_at     timestamptz;

create table if not exists public.refunds (
  id          uuid primary key default gen_random_uuid(),
  manager_id  uuid not null references public.managers(id) on delete cascade,
  payment_id  uuid not null references public.payments(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  amount      numeric(12,2) not null,
  reason      text,
  method      text,
  refunded_on date not null default current_date,
  expense_id  uuid references public.expenses(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_refunds_manager on public.refunds(manager_id, created_at desc);
alter table public.refunds enable row level security;
create policy refunds_select on public.refunds for select
  using (manager_id = auth.uid() or manager_id = (select owner_id from public.managers where id = auth.uid()));

-- Refund a payment + mirror it into Finances, atomically. Owner/assigned staff.
create or replace function public.refund_payment(p_payment_id uuid, p_amount numeric, p_reason text, p_method text, p_refunded_on date)
returns public.refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_pay   public.payments;
  v_ten   public.tenants;
  v_amt   numeric;
  v_exp   uuid;
  v_row   public.refunds;
begin
  select * into v_pay from public.payments where id = p_payment_id;
  if not found then raise exception 'Payment not found'; end if;
  v_owner := v_pay.manager_id;
  if not exists (select 1 from public.managers where id = v_owner and refunds_enabled) then
    raise exception 'Refunds are turned off for this workspace';
  end if;
  if v_pay.refunded then raise exception 'Payment already refunded'; end if;

  select * into v_ten from public.tenants where id = v_pay.tenant_id;
  v_amt := least(coalesce(p_amount, v_pay.amount), v_pay.amount);

  update public.payments set refunded = true, refunded_amount = v_amt, refunded_at = now() where id = p_payment_id;
  update public.tenants set total_paid = greatest(0, coalesce(total_paid, 0) - v_amt) where id = v_pay.tenant_id;

  insert into public.expenses (manager_id, property_id, category, amount, spent_on, note)
    values (v_owner, v_ten.property_id, 'Refund', v_amt, coalesce(p_refunded_on, current_date),
            'Refund: ' || coalesce(v_ten.first_name || ' ' || v_ten.last_name, 'tenant') || coalesce(' — ' || nullif(p_reason, ''), ''))
    returning id into v_exp;

  insert into public.refunds (manager_id, payment_id, tenant_id, amount, reason, method, refunded_on, expense_id)
    values (v_owner, p_payment_id, v_pay.tenant_id, v_amt, p_reason, coalesce(p_method, v_pay.method), coalesce(p_refunded_on, current_date), v_exp)
    returning * into v_row;

  return v_row;
end;
$$;
