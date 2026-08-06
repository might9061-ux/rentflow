-- Platform-owner key/value settings (App-owner only). Currently holds the cost
-- tracker (bills + assumptions) so it syncs across the owner's devices instead
-- of living in one browser's localStorage.
--
-- Accessed ONLY by the server's service-role client, behind the platform-admin
-- gate in routes/platform.js. RLS is enabled with NO policies, so ordinary
-- (anon/authenticated) clients can't read or write it directly.
create table if not exists platform_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table platform_settings enable row level security;
-- (Intentionally no policies — service role bypasses RLS; everyone else is denied.)
