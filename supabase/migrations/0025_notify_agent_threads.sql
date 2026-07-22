-- ═══════════════════════════════════════════════════════════════════════════
-- 0025 — owner opt-in for agent-handled tenant messages
--
-- When an agent is assigned to a property, tenant messages about that property
-- alert the AGENT, not the owner: on a portfolio with several agents, alerting
-- the owner on every tenant message makes the alerts worthless and they get
-- ignored — which is worse than no alerts at all.
--
-- The owner always SEES those conversations (RLS gives them the whole
-- workspace) and can step in. This flag only controls whether their phone also
-- buzzes. Default false = quiet, matching the routing above; an owner who
-- wants to shadow their agents can switch it on, and off again.
--
-- Deliberately NOT added to the 0019 privileged-column guard: this is an
-- ordinary preference, not a privilege, so an owner changing it on themselves
-- is exactly what should happen.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.managers
  add column if not exists notify_agent_threads boolean not null default false;

comment on column public.managers.notify_agent_threads is
  'Owner also gets a pop-up for tenant messages an assigned agent is handling. Default off.';
