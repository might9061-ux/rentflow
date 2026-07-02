-- ═══════════════════════════════════════════════════════════════════════════
-- RentFlow — 0002 Row Level Security
-- Managers see only their own data. Tenants see only their own records and
-- notifications addressed to them.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.managers           enable row level security;
alter table public.properties         enable row level security;
alter table public.tenants            enable row level security;
alter table public.payments           enable row level security;
alter table public.notifications      enable row level security;
alter table public.notification_reads enable row level security;
alter table public.otp_codes          enable row level security;
alter table public.tenant_questions   enable row level security;
alter table public.expenses           enable row level security;
alter table public.subscription_payments enable row level security;

-- Helper: is the current auth user a tenant whose manager owns row `mid`?
-- (kept inline in policies below for clarity)

-- ── managers ───────────────────────────────────────────────────────────────
drop policy if exists managers_self on public.managers;
create policy managers_self on public.managers
  for all using (id = auth.uid()) with check (id = auth.uid());

-- A tenant may read their own manager's contact card.
drop policy if exists managers_visible_to_tenant on public.managers;
create policy managers_visible_to_tenant on public.managers
  for select using (
    id in (select manager_id from public.tenants where id = auth.uid())
  );

-- ── properties ─────────────────────────────────────────────────────────────
drop policy if exists properties_manager on public.properties;
create policy properties_manager on public.properties
  for all using (manager_id = auth.uid()) with check (manager_id = auth.uid());

drop policy if exists properties_tenant_read on public.properties;
create policy properties_tenant_read on public.properties
  for select using (
    id in (select property_id from public.tenants where id = auth.uid())
  );

-- ── tenants ────────────────────────────────────────────────────────────────
-- Manager: full access to their tenants.
drop policy if exists tenants_manager on public.tenants;
create policy tenants_manager on public.tenants
  for all using (manager_id = auth.uid()) with check (manager_id = auth.uid());

-- Tenant: read own row; update only verification/login flags (handled via RPC
-- in practice, but a self-select is always allowed).
drop policy if exists tenants_self_read on public.tenants;
create policy tenants_self_read on public.tenants
  for select using (id = auth.uid());

drop policy if exists tenants_self_update on public.tenants;
create policy tenants_self_update on public.tenants
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ── payments ───────────────────────────────────────────────────────────────
drop policy if exists payments_manager on public.payments;
create policy payments_manager on public.payments
  for all using (manager_id = auth.uid()) with check (manager_id = auth.uid());

-- Tenant: read own payments + create their own (pending) submissions.
drop policy if exists payments_tenant_read on public.payments;
create policy payments_tenant_read on public.payments
  for select using (tenant_id = auth.uid());

drop policy if exists payments_tenant_insert on public.payments;
create policy payments_tenant_insert on public.payments
  for insert with check (tenant_id = auth.uid() and status = 'pending');

-- ── notifications ──────────────────────────────────────────────────────────
drop policy if exists notifications_manager on public.notifications;
create policy notifications_manager on public.notifications
  for all using (manager_id = auth.uid()) with check (manager_id = auth.uid());

-- Tenant: read notifications addressed to them (all / their property / them).
drop policy if exists notifications_tenant_read on public.notifications;
create policy notifications_tenant_read on public.notifications
  for select using (
    exists (
      select 1 from public.tenants t
      where t.id = auth.uid()
        and t.manager_id = notifications.manager_id
        and (
          notifications.recipient_scope = 'all'
          or (notifications.recipient_scope = 'property'   and notifications.property_id = t.property_id)
          or (notifications.recipient_scope = 'individual' and notifications.tenant_id   = t.id)
        )
    )
  );

-- ── notification_reads ─────────────────────────────────────────────────────
drop policy if exists reads_tenant on public.notification_reads;
create policy reads_tenant on public.notification_reads
  for all using (tenant_id = auth.uid()) with check (tenant_id = auth.uid());

drop policy if exists reads_manager_read on public.notification_reads;
create policy reads_manager_read on public.notification_reads
  for select using (
    notification_id in (select id from public.notifications where manager_id = auth.uid())
  );

-- ── otp_codes ──────────────────────────────────────────────────────────────
-- Only the owning tenant may read/consume their codes.
drop policy if exists otp_tenant on public.otp_codes;
create policy otp_tenant on public.otp_codes
  for all using (tenant_id = auth.uid()) with check (tenant_id = auth.uid());

-- ── tenant_questions ───────────────────────────────────────────────────────
-- Manager reads/updates questions for their tenants; tenant inserts their own.
drop policy if exists tq_manager on public.tenant_questions;
create policy tq_manager on public.tenant_questions
  for all using (manager_id = auth.uid()) with check (manager_id = auth.uid());

drop policy if exists tq_tenant_insert on public.tenant_questions;
create policy tq_tenant_insert on public.tenant_questions
  for insert with check (tenant_id = auth.uid());

-- ── expenses ───────────────────────────────────────────────────────────────
drop policy if exists expenses_manager on public.expenses;
create policy expenses_manager on public.expenses
  for all using (manager_id = auth.uid()) with check (manager_id = auth.uid());

-- ── subscription_payments ──────────────────────────────────────────────────
drop policy if exists sub_payments_manager on public.subscription_payments;
create policy sub_payments_manager on public.subscription_payments
  for all using (manager_id = auth.uid()) with check (manager_id = auth.uid());
