-- ═══════════════════════════════════════════════════════════════════════════
-- RentFlow — optional seed data for a REAL Supabase project.
--
-- This seeds properties/tenants/payments for an EXISTING manager. Auth users
-- must be created through Supabase Auth (managers via sign-up; tenants via the
-- create-tenant Edge Function), so this script only fills the profile tables.
--
-- 1. Sign up a manager in the app (or Auth dashboard).
-- 2. Find their id:  select id, email from auth.users;
-- 3. Set :manager below and run this file in the SQL editor.
-- ═══════════════════════════════════════════════════════════════════════════

\set manager '00000000-0000-0000-0000-000000000000'  -- ← replace with a real manager id

insert into public.properties (id, manager_id, name, location, units, type) values
  (gen_random_uuid(), :'manager', 'Avondale Heights', 'Avondale, Harare', 6, 'Apartment block'),
  (gen_random_uuid(), :'manager', 'Borrowdale Villas', 'Borrowdale, Harare', 4, 'Townhouse')
on conflict do nothing;

-- NOTE: tenant rows require a matching auth.users id. Create tenants via the
-- app (which calls the create-tenant Edge Function) rather than inserting here.
