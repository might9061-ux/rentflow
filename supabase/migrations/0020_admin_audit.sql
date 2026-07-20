-- ═══════════════════════════════════════════════════════════════════════════
-- 0020 — admin audit log
--
-- A record of every privileged action taken from the App-owner console:
-- activating or switching off a workspace's plan, recording a payment, and
-- anything else added later. Answers "who changed this, when, and to what?"
-- — which matters as soon as money and other people's data are involved.
--
-- Written ONLY by the API with the service role. Platform admins can read it;
-- nobody can edit or delete it through the app, so the trail can't be quietly
-- rewritten by whoever is being audited.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.admin_audit (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.managers(id) on delete set null,
  actor_email  text,                    -- kept even if the account is later removed
  action       text not null,           -- e.g. 'plan.activate', 'payment.record'
  target_id    uuid,                    -- the workspace acted upon
  target_email text,
  details      jsonb,                   -- before/after values, amounts, etc.
  created_at   timestamptz not null default now()
);

create index if not exists idx_admin_audit_created on public.admin_audit (created_at desc);
create index if not exists idx_admin_audit_target on public.admin_audit (target_id);

alter table public.admin_audit enable row level security;

-- Platform admins may READ the log. No insert/update/delete policies exist, so
-- only the service role (our API) can write, and nobody can alter history.
drop policy if exists admin_audit_read on public.admin_audit;
create policy admin_audit_read on public.admin_audit
  for select using (
    exists (select 1 from public.managers m where m.id = auth.uid() and m.platform_admin = true)
  );
