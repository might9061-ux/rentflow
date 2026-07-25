-- Per-property unit/house labels.
--
-- When a property has named units, `unit_labels` holds them (in order) — either
-- custom names ("Main House", "Garden Cottage") or plain numbers the manager
-- prefers. When it's empty the app falls back to numbering the units 1…N from
-- the `units` count, so existing properties are unaffected.
--
-- Stored as a JSON array of strings.
alter table public.properties
  add column if not exists unit_labels jsonb not null default '[]'::jsonb;

comment on column public.properties.unit_labels is
  'Optional ordered list of unit/house names for this property. Empty = number them 1…N from `units`.';
