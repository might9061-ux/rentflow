-- ═══════════════════════════════════════════════════════════════════════════
-- 0017 — performance indexes for the hot query paths
-- All "if not exists" so it's safe to run repeatedly. Composite indexes match
-- the exact filters + ordering the dashboards use, so reads stay fast as the
-- tables grow.
-- ═══════════════════════════════════════════════════════════════════════════

-- Payments: pending-approvals list (manager_id + status), and history/recent
-- ordered by time.
create index if not exists idx_payments_mgr_status  on public.payments (manager_id, status);
create index if not exists idx_payments_mgr_created on public.payments (manager_id, created_at desc);
create index if not exists idx_payments_tenant_created on public.payments (tenant_id, created_at desc);

-- Managers: team lookup by owner, and the platform-admin filter.
create index if not exists idx_managers_owner on public.managers (owner_id);
create index if not exists idx_managers_platform_admin on public.managers (platform_admin) where platform_admin = true;

-- Maintenance: manager/tenant lists and open-count by status.
create index if not exists idx_maintenance_manager on public.maintenance (manager_id);
create index if not exists idx_maintenance_tenant  on public.maintenance (tenant_id);
create index if not exists idx_maintenance_status  on public.maintenance (status);

-- Reminder log, payroll, payees, refunds, subscription payments, notifications
-- — all listed per workspace, newest first.
create index if not exists idx_reminder_log_mgr on public.reminder_log (manager_id, created_at desc);
create index if not exists idx_payroll_mgr      on public.payroll (manager_id, created_at desc);
create index if not exists idx_payees_mgr       on public.payees (manager_id);
create index if not exists idx_refunds_mgr      on public.refunds (manager_id, created_at desc);
create index if not exists idx_sub_pay_mgr_created on public.subscription_payments (manager_id, created_at desc);
create index if not exists idx_notifications_mgr_created on public.notifications (manager_id, created_at desc);

-- Notification reads lookup by tenant (for unread counts).
create index if not exists idx_notif_reads_tenant on public.notification_reads (tenant_id);

analyze;
