-- 0047 — facility tasks can repeat in WEEKS as well as months
-- ("check the pump every 2 weeks"). interval_months keeps the count;
-- interval_unit says what it counts.
alter table public.facility_tasks
  add column if not exists interval_unit text not null default 'months'
  check (interval_unit in ('weeks', 'months'));
