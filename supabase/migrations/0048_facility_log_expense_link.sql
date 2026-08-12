-- 0048 — link a facility-diary completion to the expense it created, so editing
-- the logged cost later keeps Finances in step (and clearing it removes the
-- expense). Completions are otherwise immutable — edit is the only way in.
alter table public.facility_logs
  add column if not exists expense_id uuid references public.expenses(id) on delete set null;
