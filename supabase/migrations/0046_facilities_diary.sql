-- 0046 — facilities diary (plant & machinery).
--
-- Scheduled, RECURRING upkeep of equipment — "service the borehole pump every
-- 3 months" — alongside the reactive repair requests in `maintenance`. Each
-- task carries its interval and next-due date; marking it done logs a history
-- entry, advances next_due by the interval, and (when a cost is given) writes
-- a Maintenance expense so Finances stays complete.

create table if not exists public.facility_tasks (
  id              uuid primary key default gen_random_uuid(),
  manager_id      uuid not null references public.managers(id) on delete cascade,
  property_id     uuid references public.properties(id) on delete set null,
  asset           text not null,             -- "Borehole pump", "Generator", "Lift"…
  task            text not null,             -- "Service", "Safety inspection"…
  interval_months integer not null default 3 check (interval_months >= 1),
  next_due        date not null,
  last_done       date,
  notes           text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_facility_tasks_manager on public.facility_tasks (manager_id);

create table if not exists public.facility_logs (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.facility_tasks(id) on delete cascade,
  manager_id  uuid not null references public.managers(id) on delete cascade,
  done_at     date not null default current_date,
  cost        numeric(12,2) default 0,
  note        text,
  done_by     text,                          -- caretaker / contractor name
  created_at  timestamptz not null default now()
);
create index if not exists idx_facility_logs_task on public.facility_logs (task_id);

alter table public.facility_tasks enable row level security;
alter table public.facility_logs  enable row level security;

-- The workspace (owner + assigned staff) has full control; tenants have none.
drop policy if exists facility_tasks_ws on public.facility_tasks;
create policy facility_tasks_ws on public.facility_tasks
  for all using (manager_id = public.workspace_owner())
  with check (manager_id = public.workspace_owner());

drop policy if exists facility_logs_ws on public.facility_logs;
create policy facility_logs_ws on public.facility_logs
  for all using (manager_id = public.workspace_owner())
  with check (manager_id = public.workspace_owner());
