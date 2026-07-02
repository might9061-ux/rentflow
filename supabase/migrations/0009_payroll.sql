-- ═══════════════════════════════════════════════════════════════════════════
-- RentFlow — 0009 Payroll
--
-- The account OWNER pays staff (agents, caretakers). Each payment is mirrored
-- into the expenses ledger as a 'Salaries' expense so Finances stays accurate.
-- Owner-only: RLS restricts both tables to the workspace owner.
-- ═══════════════════════════════════════════════════════════════════════════

-- A staff manager the owner has trusted to run payroll.
alter table public.managers
  add column if not exists can_payroll boolean not null default false;

create table if not exists public.payees (
  id          uuid primary key default gen_random_uuid(),
  manager_id  uuid not null references public.managers(id) on delete cascade,  -- workspace owner
  name        text not null,
  category    text not null default 'Other',        -- Letting agent, Caretaker, Cleaner, Security guard…
  pay_type    text not null default 'monthly',      -- monthly | weekly | daily | task | commission
  title       text,                                  -- optional note (location / shift)
  amount      numeric(12,2) not null default 0,      -- rate for the pay_type
  phone       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.payroll (
  id          uuid primary key default gen_random_uuid(),
  manager_id  uuid not null references public.managers(id) on delete cascade,
  payee_id    uuid references public.payees(id) on delete set null,
  name        text not null,
  category    text,
  amount      numeric(12,2) not null default 0,
  period      text,
  method      text not null default 'Bank Transfer',
  paid_on     date not null default current_date,
  note        text,
  expense_id  uuid references public.expenses(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_payees_manager  on public.payees(manager_id, created_at desc);
create index if not exists idx_payroll_manager on public.payroll(manager_id, created_at desc);

alter table public.payees  enable row level security;
alter table public.payroll enable row level security;

-- The workspace owner id for the caller (themselves, or their owner if staff).
-- Access granted to the owner, or to staff the owner trusted with can_payroll.
create or replace function public.payroll_owner(p_uid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select case when m.role = 'staff' and m.can_payroll then m.owner_id
              when m.role <> 'staff' then m.id
              else null end
  from public.managers m where m.id = p_uid;
$$;

create policy payees_owner  on public.payees  for all
  using (manager_id = public.payroll_owner(auth.uid())) with check (manager_id = public.payroll_owner(auth.uid()));
create policy payroll_owner on public.payroll for all
  using (manager_id = public.payroll_owner(auth.uid())) with check (manager_id = public.payroll_owner(auth.uid()));

-- Record a staff payment + its Salaries expense atomically.
create or replace function public.pay_staff(p_payee_id uuid, p_amount numeric, p_period text, p_method text, p_paid_on date, p_note text)
returns public.payroll
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.payroll_owner(auth.uid());
  v_payee public.payees;
  v_exp   uuid;
  v_row   public.payroll;
begin
  if v_owner is null then raise exception 'Not allowed to run payroll'; end if;
  select * into v_payee from public.payees where id = p_payee_id and manager_id = v_owner;
  if not found then raise exception 'Payee not found'; end if;

  insert into public.expenses (manager_id, property_id, category, amount, spent_on, note)
    values (v_owner, null, 'Salaries', p_amount, coalesce(p_paid_on, current_date),
            'Salary: ' || v_payee.name || coalesce(' (' || v_payee.category || ')', '') || coalesce(' — ' || p_period, ''))
    returning id into v_exp;

  insert into public.payroll (manager_id, payee_id, name, category, amount, period, method, paid_on, note, expense_id)
    values (v_owner, p_payee_id, v_payee.name, v_payee.category, p_amount, p_period, coalesce(p_method, 'Bank Transfer'), coalesce(p_paid_on, current_date), p_note, v_exp)
    returning * into v_row;

  return v_row;
end;
$$;
