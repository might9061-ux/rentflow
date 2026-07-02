-- ═══════════════════════════════════════════════════════════════════════════
-- RentFlow — 0006 Automated rent reminders
--
-- Per-manager reminder configuration + a log of what's been sent (so a daily
-- cron — and the in-app queue — never send the same stage twice per period).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.managers
  add column if not exists reminders_enabled boolean not null default true,
  add column if not exists reminder_channel  text not null default 'whatsapp',  -- 'whatsapp' | 'sms'
  add column if not exists reminder_rules    jsonb;                              -- null = use app defaults

-- Per-tenant opt-out: when true, no reminders are sent until un-muted.
alter table public.tenants
  add column if not exists reminders_muted boolean not null default false;

create table if not exists public.reminder_log (
  id          uuid primary key default gen_random_uuid(),
  manager_id  uuid not null references public.managers(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  rule_id     text not null,                 -- which ladder rung fired
  period      date not null,                 -- the billing period it was sent for
  channel     text not null default 'whatsapp',
  amount      numeric(12,2) not null default 0,
  created_at  timestamptz not null default now(),
  unique (manager_id, tenant_id, rule_id, period)  -- never send the same stage twice
);

create index if not exists idx_reminder_log_manager on public.reminder_log(manager_id, created_at desc);

alter table public.reminder_log enable row level security;

-- A manager (owner or assigned staff) sees the workspace log. The workspace
-- owner id is either the caller's own id (owner) or their owner_id (staff).
create policy reminder_log_select on public.reminder_log for select
  using (manager_id = auth.uid()
    or manager_id = (select owner_id from public.managers where id = auth.uid()));
create policy reminder_log_insert on public.reminder_log for insert
  with check (manager_id = auth.uid()
    or manager_id = (select owner_id from public.managers where id = auth.uid()));
