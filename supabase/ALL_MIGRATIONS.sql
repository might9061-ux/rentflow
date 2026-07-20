-- RentFlow — combined schema. Paste this whole file into Supabase SQL Editor and Run.
-- Generated 2026-06-30

-- ============================================================
-- 0001_schema.sql
-- ============================================================
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- RentFlow â€” 0001 schema
-- Core tables for managers, properties, tenants, payments, notifications.
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

create extension if not exists "pgcrypto";

-- â”€â”€ Enums â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
do $$ begin
  create type tenant_status   as enum ('active', 'paid', 'due', 'overdue', 'pending', 'inactive');
exception when duplicate_object then null; end $$;

do $$ begin
  create type account_status  as enum ('active', 'pending_verification', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status  as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type recipient_scope as enum ('all', 'property', 'individual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notif_priority  as enum ('normal', 'urgent', 'info');
exception when duplicate_object then null; end $$;

-- â”€â”€ managers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- id maps 1:1 to auth.users.id for a manager account.
create table if not exists public.managers (
  id          uuid primary key references auth.users(id) on delete cascade,
  first_name  text not null,
  last_name   text not null,
  email       text not null unique,
  phone       text,
  -- Team / multi-manager: an OWNER holds the account; STAFF managers belong to an
  -- owner and may only see the properties listed in assigned_property_ids.
  role            text not null default 'owner',   -- 'owner' | 'staff'
  owner_id        uuid references public.managers(id) on delete cascade,  -- null for owners
  assigned_property_ids uuid[] not null default '{}',  -- staff: which properties they can access
  account_status  text not null default 'active',  -- 'active' | 'suspended'
  accepted_methods text[],               -- payment methods enabled for tenants; null = all
  payment_details jsonb not null default '{}'::jsonb,  -- per-method destination info (bank acct, InnBucks noâ€¦)
  notify_on_tenant_ai boolean not null default false,  -- notify manager of tenant AI questions
  ai_enabled_self    boolean not null default true,    -- show the AI copilot in the manager's workspace
  ai_enabled_tenants boolean not null default true,    -- show the AI copilot in tenants' portals
  plan_capacity   int,                   -- subscribed tenant capacity (null = no plan)
  plan_price      numeric(12,2),         -- monthly price for that capacity
  plan_active     boolean not null default false,
  plan_started_at timestamptz,
  onboarded       boolean not null default false,  -- has picked a plan after sign-up
  billing_card    jsonb,                 -- saved card on file {brand,last4,exp,name} (never the full PAN)
  brand_name      text,                  -- white-label app name (Growth+ plans)
  brand_logo      text,                  -- white-label logo (Storage URL / data URL)
  brand_color     text,                  -- white-label accent colour (hex)
  created_at  timestamptz not null default now()
);

-- Installment (subscription) payments the manager makes for their plan.
create table if not exists public.subscription_payments (
  id          uuid primary key default gen_random_uuid(),
  manager_id  uuid not null references public.managers(id) on delete cascade,
  amount      numeric(12,2) not null,
  period      text,                      -- e.g. 'June 2026'
  method      text,                      -- e.g. 'Visa Â·Â·Â·Â·4242'
  reference   text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_sub_payments_manager on public.subscription_payments(manager_id);



-- â”€â”€ properties â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table if not exists public.properties (
  id          uuid primary key default gen_random_uuid(),
  manager_id  uuid not null references public.managers(id) on delete cascade,
  name        text not null,
  location    text,
  units       int  not null default 1 check (units >= 0),
  type        text,                       -- e.g. Apartment block, Townhouse, Commercial
  -- media
  photos      jsonb not null default '[]'::jsonb,   -- array of image URLs (first = cover)
  -- location detail
  address     text,
  suburb      text,
  city        text,
  province    text,
  map_link    text,                       -- Google Maps / GPS link
  -- layout & rooms
  bedrooms    int,
  bathrooms   numeric(3,1),
  lounges     int,
  floor_size  numeric(10,1),              -- mÂ²
  stand_size  numeric(10,1),              -- mÂ²
  furnished   text,                       -- Unfurnished / Part-furnished / Furnished
  year_built  int,
  storeys     int,
  -- features
  amenities   jsonb not null default '[]'::jsonb,   -- array of amenity keys
  -- rental terms
  deposit            numeric(12,2),
  available_from     date,
  utilities_included jsonb not null default '[]'::jsonb,
  max_occupants      int,
  levy_fee           numeric(12,2),
  -- notes & contact
  description text,
  rules       text,
  caretaker_name  text,
  caretaker_phone text,
  -- advertising
  is_advertised boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_properties_manager on public.properties(manager_id);

-- â”€â”€ tenants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- id maps 1:1 to auth.users.id for the tenant's login account.
create table if not exists public.tenants (
  id              uuid primary key,        -- = auth.users.id once account created
  manager_id      uuid not null references public.managers(id) on delete cascade,
  property_id     uuid references public.properties(id) on delete set null,
  first_name      text not null,
  last_name       text not null,
  email           text not null,
  phone           text,
  unit            text,
  rent            numeric(12,2) not null default 0 check (rent >= 0),
  due_day         int not null default 1 check (due_day between 1 and 31),
  lease_start     date,
  lease_end       date,
  lease_doc       text,                    -- lease agreement (Storage URL / data URL in demo)
  lease_doc_name  text,
  status          tenant_status  not null default 'pending',
  account_status  account_status not null default 'pending_verification',
  total_paid      numeric(12,2) not null default 0,
  credit_balance  numeric(12,2) not null default 0,
  first_login     boolean not null default true,
  email_verified  boolean not null default false,
  phone_verified  boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists idx_tenants_manager  on public.tenants(manager_id);
create index if not exists idx_tenants_property on public.tenants(property_id);
create unique index if not exists idx_tenants_email on public.tenants(lower(email));

-- Tenant questions asked to the AI assistant (surfaced to the manager when
-- notify_on_tenant_ai is on).
create table if not exists public.tenant_questions (
  id          uuid primary key default gen_random_uuid(),
  manager_id  uuid not null references public.managers(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  question    text not null,
  answer      text,
  read_by_manager boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_tenant_questions_manager on public.tenant_questions(manager_id);

-- â”€â”€ expenses (manager-side costs for the revenue-vs-cost dashboard) â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  manager_id  uuid not null references public.managers(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  category    text not null,             -- Maintenance, Utilities, Rates, Otherâ€¦
  amount      numeric(12,2) not null check (amount >= 0),
  spent_on    date not null default current_date,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_expenses_manager on public.expenses(manager_id);

-- â”€â”€ payments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  manager_id    uuid not null references public.managers(id) on delete cascade,
  amount        numeric(12,2) not null check (amount > 0),
  method        text not null,             -- Cash USD, EcoCash, InnBucks, Bank Transfer, Mukuru
  reference     text,                      -- transaction reference / proof
  paid_date     date not null default current_date,
  period_from   date not null,
  period_to     date not null,
  status        payment_status not null default 'pending',
  is_advance    boolean not null default false,
  credit_amount numeric(12,2) not null default 0,   -- portion that became credit
  receipt_no    text,                      -- assigned on approval
  rejected_reason text,
  payer_phone   text,                      -- mobile number that made an EcoCash payment
  proof_url     text,                      -- uploaded receipt/screenshot (Storage URL)
  paid_online   boolean not null default false,  -- confirmed by the payment gateway
  gateway_ref   text,                      -- gateway transaction id
  recorded_by   text,                      -- 'manager' when the manager logged it (e.g. cash)
  created_at    timestamptz not null default now(),
  approved_at   timestamptz
);
create index if not exists idx_payments_tenant  on public.payments(tenant_id);
create index if not exists idx_payments_manager on public.payments(manager_id);
create index if not exists idx_payments_status  on public.payments(status);

-- â”€â”€ notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  manager_id      uuid not null references public.managers(id) on delete cascade,
  recipient_scope recipient_scope not null,
  property_id     uuid references public.properties(id) on delete cascade,
  tenant_id       uuid references public.tenants(id) on delete cascade,
  subject         text not null,
  message         text not null,
  priority        notif_priority not null default 'normal',
  created_at      timestamptz not null default now()
);
create index if not exists idx_notifications_manager on public.notifications(manager_id);

-- â”€â”€ notification_reads â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, tenant_id)
);

-- â”€â”€ otp_codes (used by the SMS/email OTP RPC stub) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table if not exists public.otp_codes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  channel     text not null check (channel in ('email','phone')),
  code        text not null,
  expires_at  timestamptz not null,
  consumed    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_otp_tenant on public.otp_codes(tenant_id);


-- ============================================================
-- 0002_rls.sql
-- ============================================================
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- RentFlow â€” 0002 Row Level Security
-- Managers see only their own data. Tenants see only their own records and
-- notifications addressed to them.
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

-- â”€â”€ managers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
drop policy if exists managers_self on public.managers;
create policy managers_self on public.managers
  for all using (id = auth.uid()) with check (id = auth.uid());

-- A tenant may read their own manager's contact card.
drop policy if exists managers_visible_to_tenant on public.managers;
create policy managers_visible_to_tenant on public.managers
  for select using (
    id in (select manager_id from public.tenants where id = auth.uid())
  );

-- â”€â”€ properties â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
drop policy if exists properties_manager on public.properties;
create policy properties_manager on public.properties
  for all using (manager_id = auth.uid()) with check (manager_id = auth.uid());

drop policy if exists properties_tenant_read on public.properties;
create policy properties_tenant_read on public.properties
  for select using (
    id in (select property_id from public.tenants where id = auth.uid())
  );

-- â”€â”€ tenants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€ payments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€ notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€ notification_reads â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
drop policy if exists reads_tenant on public.notification_reads;
create policy reads_tenant on public.notification_reads
  for all using (tenant_id = auth.uid()) with check (tenant_id = auth.uid());

drop policy if exists reads_manager_read on public.notification_reads;
create policy reads_manager_read on public.notification_reads
  for select using (
    notification_id in (select id from public.notifications where manager_id = auth.uid())
  );

-- â”€â”€ otp_codes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Only the owning tenant may read/consume their codes.
drop policy if exists otp_tenant on public.otp_codes;
create policy otp_tenant on public.otp_codes
  for all using (tenant_id = auth.uid()) with check (tenant_id = auth.uid());

-- â”€â”€ tenant_questions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Manager reads/updates questions for their tenants; tenant inserts their own.
drop policy if exists tq_manager on public.tenant_questions;
create policy tq_manager on public.tenant_questions
  for all using (manager_id = auth.uid()) with check (manager_id = auth.uid());

drop policy if exists tq_tenant_insert on public.tenant_questions;
create policy tq_tenant_insert on public.tenant_questions
  for insert with check (tenant_id = auth.uid());

-- â”€â”€ expenses â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
drop policy if exists expenses_manager on public.expenses;
create policy expenses_manager on public.expenses
  for all using (manager_id = auth.uid()) with check (manager_id = auth.uid());

-- â”€â”€ subscription_payments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
drop policy if exists sub_payments_manager on public.subscription_payments;
create policy sub_payments_manager on public.subscription_payments
  for all using (manager_id = auth.uid()) with check (manager_id = auth.uid());


-- ============================================================
-- 0003_functions.sql
-- ============================================================
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- RentFlow â€” 0003 functions, triggers & RPC stubs
--
-- These back the "client-only" architecture: privileged work runs inside the
-- database as SECURITY DEFINER functions instead of a separate server.
--
-- NOTE on tenant auth accounts: creating a row in auth.users from SQL is not
-- officially supported. For production, deploy the Edge Function template in
-- supabase/functions/create-tenant/ which uses the service_role admin API.
-- The create_tenant() RPC below provisions the public.tenants profile row and
-- a temp password record; the Edge Function (or the demo mock) creates the
-- matching auth user. See README "Going to production".
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

-- â”€â”€ Auto-create a manager profile when a manager signs up â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.handle_new_manager()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Only create a profile when the signup carried manager metadata.
  if (new.raw_user_meta_data ->> 'role') = 'manager' then
    insert into public.managers (id, first_name, last_name, email, phone)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'first_name', ''),
      coalesce(new.raw_user_meta_data ->> 'last_name', ''),
      new.email,
      new.raw_user_meta_data ->> 'phone'
    )
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_manager();

-- â”€â”€ Receipt number generator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.next_receipt_no()
returns text language plpgsql as $$
declare n bigint;
begin
  n := nextval('public.receipt_seq');
  return 'RF-' || to_char(now(), 'YYMM') || '-' || lpad(n::text, 5, '0');
end $$;

create sequence if not exists public.receipt_seq start 1001;

-- â”€â”€ create_tenant : manager provisions a tenant profile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Returns the new tenant id. The temp password is generated client-side and
-- passed in (so it can be shown to the manager for the WhatsApp handoff).
create or replace function public.create_tenant(
  p_property_id  uuid,
  p_first_name   text,
  p_last_name    text,
  p_email        text,
  p_phone        text,
  p_unit         text,
  p_rent         numeric,
  p_due_day      int,
  p_lease_start  date,
  p_tenant_id    uuid default gen_random_uuid()
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_manager uuid := auth.uid();
  v_count   int;
  v_cap     int;
begin
  if v_manager is null then raise exception 'Not authenticated'; end if;

  -- Enforce plan capacity. No active plan â‡’ capacity 0 (must subscribe first).
  select count(*) into v_count from public.tenants where manager_id = v_manager;
  select case when plan_active then coalesce(plan_capacity, 0) else 0 end
    into v_cap from public.managers where id = v_manager;
  if v_count >= v_cap then
    raise exception 'Active plan required to add tenants (% of % used). Subscribe or upgrade your plan.', v_count, v_cap;
  end if;

  insert into public.tenants (
    id, manager_id, property_id, first_name, last_name, email, phone,
    unit, rent, due_day, lease_start, status, account_status,
    first_login, email_verified, phone_verified
  ) values (
    p_tenant_id, v_manager, p_property_id, p_first_name, p_last_name, lower(p_email), p_phone,
    p_unit, p_rent, p_due_day, p_lease_start, 'pending', 'pending_verification',
    true, false, false
  );

  return p_tenant_id;
end $$;

-- â”€â”€ request_otp : "send" a 6-digit code (logged to table = SMS stub) â”€â”€â”€â”€â”€â”€â”€
create or replace function public.request_otp(p_tenant_id uuid, p_channel text)
returns void language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  -- invalidate previous codes for this channel
  update public.otp_codes set consumed = true
   where tenant_id = p_tenant_id and channel = p_channel and consumed = false;
  insert into public.otp_codes (tenant_id, channel, code, expires_at)
  values (p_tenant_id, p_channel, v_code, now() + interval '10 minutes');
  -- PRODUCTION: call Africa's Talking (SMS) or Supabase email here, e.g. via
  -- pg_net to an Edge Function. In the stub the code simply lives in the table.
  raise notice 'RentFlow OTP for % via %: %', p_tenant_id, p_channel, v_code;
end $$;

-- â”€â”€ verify_otp : check a code and flip the verification flag â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.verify_otp(p_tenant_id uuid, p_channel text, p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_ok boolean;
begin
  select true into v_ok from public.otp_codes
   where tenant_id = p_tenant_id and channel = p_channel and code = p_code
     and consumed = false and expires_at > now()
   limit 1;

  if v_ok is not true then return false; end if;

  update public.otp_codes set consumed = true
   where tenant_id = p_tenant_id and channel = p_channel and code = p_code;

  if p_channel = 'email' then
    update public.tenants set email_verified = true where id = p_tenant_id;
  else
    update public.tenants set phone_verified = true where id = p_tenant_id;
  end if;

  return true;
end $$;

-- â”€â”€ complete_first_login : clear firstLogin + activate account â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.complete_first_login(p_tenant_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.tenants
     set first_login = false,
         account_status = 'active',
         status = case when status = 'pending' then 'due' else status end
   where id = p_tenant_id;
end $$;

-- â”€â”€ approve_payment : apply advance/credit logic, assign receipt â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.approve_payment(p_payment_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_pay   public.payments%rowtype;
  v_rent  numeric;
  v_credit numeric;
  v_new_credit numeric;
  v_receipt text;
begin
  select * into v_pay from public.payments where id = p_payment_id;
  if not found then raise exception 'Payment not found'; end if;
  if v_pay.manager_id <> auth.uid() then raise exception 'Not your payment'; end if;

  select rent, credit_balance into v_rent, v_credit
    from public.tenants where id = v_pay.tenant_id;

  -- Effective funds available this cycle = existing credit + this payment.
  -- Whatever exceeds one month's rent rolls forward as new credit.
  v_new_credit := greatest(0, (v_credit + v_pay.amount) - v_rent);
  v_receipt := public.next_receipt_no();

  update public.payments
     set status = 'approved',
         receipt_no = v_receipt,
         is_advance = (v_new_credit > 0),
         credit_amount = v_new_credit,
         approved_at = now()
   where id = p_payment_id;

  update public.tenants
     set total_paid = total_paid + v_pay.amount,
         credit_balance = v_new_credit,
         status = case when v_new_credit >= v_rent then 'paid'
                       when (v_credit + v_pay.amount) >= v_rent then 'paid'
                       else 'due' end
   where id = v_pay.tenant_id;

  return v_receipt;
end $$;

-- â”€â”€ reject_payment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.reject_payment(p_payment_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.payments
     set status = 'rejected', rejected_reason = p_reason
   where id = p_payment_id and manager_id = auth.uid();
end $$;

-- â”€â”€ mark_notification_read â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.mark_notification_read(p_notification_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notification_reads (notification_id, tenant_id)
  values (p_notification_id, auth.uid())
  on conflict do nothing;
end $$;


-- ============================================================
-- 0004_team_rls.sql
-- ============================================================
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- RentFlow â€” 0004 Team / multi-manager Row Level Security
--
-- The 0002 policies scoped everything by `manager_id = auth.uid()`. With the
-- Team feature, all workspace data is stored under the OWNER's id, and STAFF
-- managers (managers.role = 'staff', managers.owner_id = <owner>) must see only
-- the properties listed in their managers.assigned_property_ids â€” and the
-- tenants / payments / expenses inside those.
--
-- These helpers + policies enforce, server-side:
--   â€¢ cross-OWNER isolation  â€” one workspace can never read another's rows
--   â€¢ per-property staff scope â€” staff see only their assigned buildings
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

-- â”€â”€ Helpers (SECURITY DEFINER so they can read `managers` without recursing
--    through that table's own RLS) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.workspace_owner()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce((select owner_id from public.managers where id = auth.uid()), auth.uid());
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'staff' from public.managers where id = auth.uid()), false);
$$;

create or replace function public.staff_property_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce((select assigned_property_ids from public.managers where id = auth.uid()), '{}'::uuid[]);
$$;

-- A property is in the caller's scope when it belongs to their workspace and,
-- for staff, is one of their assigned properties.
create or replace function public.can_access_property(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.properties p
    where p.id = pid
      and p.manager_id = public.workspace_owner()
      and (not public.is_staff() or p.id = any(public.staff_property_ids()))
  );
$$;

-- â”€â”€ managers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Owners can read & manage their own staff rows (the Team page).
drop policy if exists managers_owner_team on public.managers;
create policy managers_owner_team on public.managers
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Prevent a STAFF member from escalating their own access by editing the
-- privileged columns (role / owner_id / assigned_property_ids) on their row.
create or replace function public.guard_manager_self_update()
returns trigger language plpgsql as $$
begin
  if auth.uid() = new.id
     and coalesce(old.role, 'owner') = 'staff'
     and (new.role is distinct from old.role
       or new.owner_id is distinct from old.owner_id
       or new.assigned_property_ids is distinct from old.assigned_property_ids
       or new.account_status is distinct from old.account_status) then
    raise exception 'Staff cannot change their own role, owner or property assignments';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_manager_self_update on public.managers;
create trigger trg_guard_manager_self_update
  before update on public.managers
  for each row execute function public.guard_manager_self_update();

-- â”€â”€ properties â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
drop policy if exists properties_manager on public.properties;
create policy properties_workspace on public.properties
  for all using (
    manager_id = public.workspace_owner()
    and (not public.is_staff() or id = any(public.staff_property_ids()))
  ) with check (manager_id = public.workspace_owner());

-- â”€â”€ tenants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
drop policy if exists tenants_manager on public.tenants;
create policy tenants_workspace on public.tenants
  for all using (
    manager_id = public.workspace_owner()
    and (not public.is_staff() or (property_id is not null and property_id = any(public.staff_property_ids())))
  ) with check (manager_id = public.workspace_owner());

-- â”€â”€ payments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
drop policy if exists payments_manager on public.payments;
create policy payments_workspace on public.payments
  for all using (
    manager_id = public.workspace_owner()
    and (not public.is_staff() or tenant_id in (
      select id from public.tenants
      where property_id is not null and property_id = any(public.staff_property_ids())
    ))
  ) with check (manager_id = public.workspace_owner());

-- â”€â”€ notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
drop policy if exists notifications_manager on public.notifications;
create policy notifications_workspace on public.notifications
  for all using (
    manager_id = public.workspace_owner()
    and (not public.is_staff()
      or recipient_scope = 'all'
      or (property_id is not null and property_id = any(public.staff_property_ids())))
  ) with check (manager_id = public.workspace_owner());

-- â”€â”€ expenses â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
drop policy if exists expenses_manager on public.expenses;
create policy expenses_workspace on public.expenses
  for all using (
    manager_id = public.workspace_owner()
    and (not public.is_staff() or (property_id is not null and property_id = any(public.staff_property_ids())))
  ) with check (manager_id = public.workspace_owner());

-- â”€â”€ subscription_payments (billing) â€” OWNER only, never staff â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
drop policy if exists sub_payments_manager on public.subscription_payments;
create policy sub_payments_owner on public.subscription_payments
  for all using (manager_id = auth.uid() and not public.is_staff())
  with check (manager_id = auth.uid() and not public.is_staff());

-- Note: tenant-side read policies from 0002 (tenants_self_read, payments_tenant_*,
-- notifications_tenant_read, managers_visible_to_tenant) are unchanged â€” tenants
-- still relate to their workspace via tenants.manager_id = owner id.


-- ============================================================
-- 0005_login_helpers.sql
-- ============================================================
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- RentFlow â€” 0005 Login helpers
--
-- Sign-in accepts EITHER a phone number or an email. Supabase auth needs an
-- email, so this resolves a phone to the matching account email. Phones are
-- compared on their last 9 significant digits so local (077â€¦), country-code
-- (26377â€¦) and formatted (+263 77 â€¦) inputs all match.
--
-- SECURITY DEFINER + a tight body so it only ever returns an email string,
-- never any other column; granted to anon so it can run before authentication.
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

create or replace function public.email_for_login(p_phone text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with d as (select right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9) as tail)
  select m.email from public.managers m, d
    where length(d.tail) >= 7
      and right(regexp_replace(coalesce(m.phone, ''), '\D', '', 'g'), 9) = d.tail
  union
  select t.email from public.tenants t, d
    where length(d.tail) >= 7
      and right(regexp_replace(coalesce(t.phone, ''), '\D', '', 'g'), 9) = d.tail
  limit 1;
$$;

grant execute on function public.email_for_login(text) to anon, authenticated;


-- ============================================================
-- 0006_reminders.sql
-- ============================================================
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- RentFlow â€” 0006 Automated rent reminders
--
-- Per-manager reminder configuration + a log of what's been sent (so a daily
-- cron â€” and the in-app queue â€” never send the same stage twice per period).
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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


-- ============================================================
-- 0007_maintenance.sql
-- ============================================================
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- RentFlow â€” 0007 Maintenance / repair requests
--
-- Tenants log repair requests (with a photo); managers triage, assign a
-- caretaker, set a cost and resolve them. A resolved request with a cost is
-- mirrored into the expenses ledger so per-property P&L stays accurate.
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

create table if not exists public.maintenance (
  id             uuid primary key default gen_random_uuid(),
  manager_id     uuid not null references public.managers(id) on delete cascade,   -- workspace owner
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  property_id    uuid references public.properties(id) on delete set null,
  unit           text,
  title          text not null,
  category       text not null default 'General',
  description    text,
  photo_url      text,
  priority       text not null default 'normal',   -- 'normal' | 'urgent'
  status         text not null default 'open',      -- 'open' | 'in_progress' | 'resolved'
  cost           numeric(12,2) not null default 0,
  manager_note   text,
  caretaker_name text,
  expense_logged boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  resolved_at    timestamptz
);

create index if not exists idx_maintenance_manager on public.maintenance(manager_id, status);
create index if not exists idx_maintenance_tenant  on public.maintenance(tenant_id, created_at desc);

alter table public.maintenance enable row level security;

-- Tenants see and create their own requests.
create policy maintenance_tenant_select on public.maintenance for select using (tenant_id = auth.uid());
create policy maintenance_tenant_insert on public.maintenance for insert with check (tenant_id = auth.uid());

-- A manager (owner or assigned staff) sees and updates the workspace's requests.
create policy maintenance_manager_select on public.maintenance for select
  using (manager_id = auth.uid()
    or manager_id = (select owner_id from public.managers where id = auth.uid()));
create policy maintenance_manager_update on public.maintenance for update
  using (manager_id = auth.uid()
    or manager_id = (select owner_id from public.managers where id = auth.uid()));

-- â”€â”€ Resolved repair â†’ expense (with full detail) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Link expenses back to the request that created them.
alter table public.expenses
  add column if not exists maintenance_id uuid references public.maintenance(id) on delete set null;

-- When a request is resolved with a cost (and hasn't been logged yet), mirror it
-- into the expenses ledger with what/category/unit/tenant/caretaker in the note.
create or replace function public.log_maintenance_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_note text;
begin
  if NEW.status = 'resolved' and NEW.cost > 0 and not NEW.expense_logged then
    select nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
      into v_name from public.tenants where id = NEW.tenant_id;
    v_note := 'Repair: ' || NEW.title || ' (' || NEW.category
      || case when coalesce(NEW.unit, '') <> '' then ', Unit ' || NEW.unit else '' end
      || case when v_name is not null then ', ' || v_name else '' end || ')'
      || case when coalesce(NEW.caretaker_name, '') <> '' then ' Â· by ' || NEW.caretaker_name else '' end;
    insert into public.expenses (manager_id, property_id, category, amount, spent_on, note, maintenance_id)
      values (NEW.manager_id, NEW.property_id, 'Maintenance', NEW.cost, current_date, v_note, NEW.id);
    NEW.expense_logged := true;
    if NEW.resolved_at is null then NEW.resolved_at := now(); end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_log_maintenance_expense on public.maintenance;
create trigger trg_log_maintenance_expense
  before update on public.maintenance
  for each row execute function public.log_maintenance_expense();


-- ============================================================
-- 0008_markets_late_fees.sql
-- ============================================================
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- RentFlow â€” 0008 Multi-country + late fees
--
-- A manager picks their COUNTRY, which drives the currency shown across the app
-- and the mobile-money methods tenants can use (resolved client-side from
-- markets.js). Plus an optional late-fee policy on overdue rent.
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

alter table public.managers
  add column if not exists country             text not null default 'ZW',     -- ISO-2 market code
  add column if not exists currency            text not null default 'USD',     -- primary (display) currency
  add column if not exists currencies          text[] not null default '{USD}', -- accepted currencies (one or both)
  add column if not exists late_fee_enabled    boolean not null default false,
  add column if not exists late_fee_type       text not null default 'flat',   -- 'flat' | 'percent'
  add column if not exists late_fee_amount      numeric(12,2) not null default 0,
  add column if not exists late_fee_grace_days  int not null default 3;


-- ============================================================
-- 0009_payroll.sql
-- ============================================================
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- RentFlow â€” 0009 Payroll
--
-- The account OWNER pays staff (agents, caretakers). Each payment is mirrored
-- into the expenses ledger as a 'Salaries' expense so Finances stays accurate.
-- Owner-only: RLS restricts both tables to the workspace owner.
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

-- A staff manager the owner has trusted to run payroll.
alter table public.managers
  add column if not exists can_payroll boolean not null default false;

create table if not exists public.payees (
  id          uuid primary key default gen_random_uuid(),
  manager_id  uuid not null references public.managers(id) on delete cascade,  -- workspace owner
  name        text not null,
  category    text not null default 'Other',        -- Letting agent, Caretaker, Cleaner, Security guardâ€¦
  pay_type    text not null default 'monthly',      -- monthly | weekly | daily | task | commission
  title       text,                                  -- optional note (location / shift)
  amount      numeric(12,2) not null default 0,      -- rate for the pay_type
  phone       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.payroll (
  id          uuid primary key default gen_random_uuid(),
  manager_id  uuid not null references public.managers(id) on delete cascade,
  payee_id    uuid references public.payees(id) on delete set null,
  name        text not null,
  category    text,
  amount      numeric(12,2) not null default 0,
  period      text,
  method      text not null default 'Bank Transfer',
  paid_on     date not null default current_date,
  note        text,
  expense_id  uuid references public.expenses(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_payees_manager  on public.payees(manager_id, created_at desc);
create index if not exists idx_payroll_manager on public.payroll(manager_id, created_at desc);

alter table public.payees  enable row level security;
alter table public.payroll enable row level security;

-- The workspace owner id for the caller (themselves, or their owner if staff).
-- Access granted to the owner, or to staff the owner trusted with can_payroll.
create or replace function public.payroll_owner(p_uid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select case when m.role = 'staff' and m.can_payroll then m.owner_id
              when m.role <> 'staff' then m.id
              else null end
  from public.managers m where m.id = p_uid;
$$;

create policy payees_owner  on public.payees  for all
  using (manager_id = public.payroll_owner(auth.uid())) with check (manager_id = public.payroll_owner(auth.uid()));
create policy payroll_owner on public.payroll for all
  using (manager_id = public.payroll_owner(auth.uid())) with check (manager_id = public.payroll_owner(auth.uid()));

-- Record a staff payment + its Salaries expense atomically.
create or replace function public.pay_staff(p_payee_id uuid, p_amount numeric, p_period text, p_method text, p_paid_on date, p_note text)
returns public.payroll
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.payroll_owner(auth.uid());
  v_payee public.payees;
  v_exp   uuid;
  v_row   public.payroll;
begin
  if v_owner is null then raise exception 'Not allowed to run payroll'; end if;
  select * into v_payee from public.payees where id = p_payee_id and manager_id = v_owner;
  if not found then raise exception 'Payee not found'; end if;

  insert into public.expenses (manager_id, property_id, category, amount, spent_on, note)
    values (v_owner, null, 'Salaries', p_amount, coalesce(p_paid_on, current_date),
            'Salary: ' || v_payee.name || coalesce(' (' || v_payee.category || ')', '') || coalesce(' â€” ' || p_period, ''))
    returning id into v_exp;

  insert into public.payroll (manager_id, payee_id, name, category, amount, period, method, paid_on, note, expense_id)
    values (v_owner, p_payee_id, v_payee.name, v_payee.category, p_amount, p_period, coalesce(p_method, 'Bank Transfer'), coalesce(p_paid_on, current_date), p_note, v_exp)
    returning * into v_row;

  return v_row;
end;
$$;


-- ============================================================
-- 0010_transaction_fee.sql
-- ============================================================
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- RentFlow â€” 0010 Transaction fee
--
-- A 0.5% platform fee is added ON TOP of each tenant rent payment. The tenant
-- pays rent + fee; the manager receives the full rent (`amount`); the fee is
-- platform revenue surfaced in the admin dashboard. `fee` stores the charge.
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

alter table public.payments
  add column if not exists fee numeric(12,2) not null default 0;


-- ============================================================
-- 0011_refunds.sql
-- ============================================================
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- RentFlow â€” 0011 Refunds
--
-- A manager can choose whether they offer refunds (refunds_enabled). When on,
-- they can refund an approved payment; the tenant's total drops and a 'Refund'
-- expense is mirrored into Finances. Tenants are shown the policy either way.
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

alter table public.managers
  add column if not exists refunds_enabled boolean not null default false;

alter table public.payments
  add column if not exists refunded        boolean not null default false,
  add column if not exists refunded_amount numeric(12,2),
  add column if not exists refunded_at     timestamptz;

create table if not exists public.refunds (
  id          uuid primary key default gen_random_uuid(),
  manager_id  uuid not null references public.managers(id) on delete cascade,
  payment_id  uuid not null references public.payments(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  amount      numeric(12,2) not null,
  reason      text,
  method      text,
  refunded_on date not null default current_date,
  expense_id  uuid references public.expenses(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_refunds_manager on public.refunds(manager_id, created_at desc);
alter table public.refunds enable row level security;
create policy refunds_select on public.refunds for select
  using (manager_id = auth.uid() or manager_id = (select owner_id from public.managers where id = auth.uid()));

-- Refund a payment + mirror it into Finances, atomically. Owner/assigned staff.
create or replace function public.refund_payment(p_payment_id uuid, p_amount numeric, p_reason text, p_method text, p_refunded_on date)
returns public.refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_pay   public.payments;
  v_ten   public.tenants;
  v_amt   numeric;
  v_exp   uuid;
  v_row   public.refunds;
begin
  select * into v_pay from public.payments where id = p_payment_id;
  if not found then raise exception 'Payment not found'; end if;
  v_owner := v_pay.manager_id;
  if not exists (select 1 from public.managers where id = v_owner and refunds_enabled) then
    raise exception 'Refunds are turned off for this workspace';
  end if;
  if v_pay.refunded then raise exception 'Payment already refunded'; end if;

  select * into v_ten from public.tenants where id = v_pay.tenant_id;
  v_amt := least(coalesce(p_amount, v_pay.amount), v_pay.amount);

  update public.payments set refunded = true, refunded_amount = v_amt, refunded_at = now() where id = p_payment_id;
  update public.tenants set total_paid = greatest(0, coalesce(total_paid, 0) - v_amt) where id = v_pay.tenant_id;

  insert into public.expenses (manager_id, property_id, category, amount, spent_on, note)
    values (v_owner, v_ten.property_id, 'Refund', v_amt, coalesce(p_refunded_on, current_date),
            'Refund: ' || coalesce(v_ten.first_name || ' ' || v_ten.last_name, 'tenant') || coalesce(' â€” ' || nullif(p_reason, ''), ''))
    returning id into v_exp;

  insert into public.refunds (manager_id, payment_id, tenant_id, amount, reason, method, refunded_on, expense_id)
    values (v_owner, p_payment_id, v_pay.tenant_id, v_amt, p_reason, coalesce(p_method, v_pay.method), coalesce(p_refunded_on, current_date), v_exp)
    returning * into v_row;

  return v_row;
end;
$$;


-- ============================================================
-- 0012_avatars.sql
-- ============================================================
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- RentFlow â€” 0012 Profile pictures
--
-- Managers, agents and tenants can set a profile picture. Stored here as a
-- small data URL for simplicity; in production this would be a Storage URL.
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

alter table public.managers add column if not exists avatar text;
alter table public.tenants  add column if not exists avatar text;



-- ─────────────────────────────────────────────────────────────────────────
-- 0013_platform_admin_and_maintenance_rpc.sql
-- ─────────────────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════
-- RentFlow — 0013 Platform-admin flag + create_maintenance RPC
--
-- Two gaps the earlier migrations never defined but the app relies on:
--   1. managers.platform_admin — marks the RentFlow HQ (app-owner) account that
--      sees cross-workspace subscriptions/revenue instead of a workspace.
--   2. create_maintenance() — lets a tenant log a repair request while the
--      manager_id / property_id / unit are derived from their own row (so the
--      client can't spoof another workspace).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Platform-admin flag ------------------------------------------------------
alter table public.managers
  add column if not exists platform_admin boolean not null default false;

-- 2. create_maintenance RPC ---------------------------------------------------
create or replace function public.create_maintenance(
  p_title       text,
  p_category    text default 'General',
  p_description text default '',
  p_photo_url   text default null,
  p_priority    text default 'normal'
) returns public.maintenance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t   public.tenants;
  v_row public.maintenance;
begin
  select * into v_t from public.tenants where id = auth.uid();
  if v_t.id is null then
    raise exception 'Only a tenant can create a maintenance request';
  end if;

  insert into public.maintenance
    (tenant_id, manager_id, property_id, unit, title, category, description, photo_url, priority, status)
  values
    (v_t.id, v_t.manager_id, v_t.property_id, v_t.unit,
     p_title, coalesce(p_category, 'General'), coalesce(p_description, ''),
     p_photo_url, coalesce(p_priority, 'normal'), 'open')
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.create_maintenance(text, text, text, text, text) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 0014_fix_approve_payment_enum_cast.sql
-- ─────────────────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════
-- 0014 — fix approve_payment enum cast
-- The tenants.status column is the enum `tenant_status`, but the CASE in
-- approve_payment produced plain text ('paid'/'due'), so Postgres raised:
--   column "status" is of type tenant_status but expression is of type text
-- Cast the CASE result to tenant_status.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.approve_payment(p_payment_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_pay   public.payments%rowtype;
  v_rent  numeric;
  v_credit numeric;
  v_new_credit numeric;
  v_receipt text;
begin
  select * into v_pay from public.payments where id = p_payment_id;
  if not found then raise exception 'Payment not found'; end if;
  if v_pay.manager_id <> auth.uid() then raise exception 'Not your payment'; end if;

  select rent, credit_balance into v_rent, v_credit
    from public.tenants where id = v_pay.tenant_id;

  v_new_credit := greatest(0, (v_credit + v_pay.amount) - v_rent);
  v_receipt := public.next_receipt_no();

  update public.payments
     set status = 'approved',
         receipt_no = v_receipt,
         is_advance = (v_new_credit > 0),
         credit_amount = v_new_credit,
         approved_at = now()
   where id = p_payment_id;

  update public.tenants
     set total_paid = total_paid + v_pay.amount,
         credit_balance = v_new_credit,
         status = (case when v_new_credit >= v_rent then 'paid'
                        when (v_credit + v_pay.amount) >= v_rent then 'paid'
                        else 'due' end)::tenant_status
   where id = v_pay.tenant_id;

  return v_receipt;
end $$;


-- ─────────────────────────────────────────────────────────────────────────
-- 0015_fix_credit_multiple_payments.sql
-- ─────────────────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════
-- 0015 — fix credit on multiple / overpayments in the same period
-- Bug: approve_payment subtracted a full month's rent from EVERY payment, so a
-- second payment for an already-paid period lost its money instead of becoming
-- credit (e.g. two $500 payments for $500 rent → credit ended at $0, not $500).
-- Fix: look at what's already been paid toward this payment's period, only
-- require the remainder, and carry the rest forward as credit. (Also keeps the
-- 0014 tenant_status enum cast.)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.approve_payment(p_payment_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_pay        public.payments%rowtype;
  v_rent       numeric;
  v_credit     numeric;
  v_period_paid numeric;   -- already approved toward THIS payment's period
  v_needed     numeric;    -- of this payment, how much still covers the period
  v_new_credit numeric;
  v_covered    boolean;
  v_receipt    text;
begin
  select * into v_pay from public.payments where id = p_payment_id;
  if not found then raise exception 'Payment not found'; end if;
  if v_pay.manager_id <> auth.uid() then raise exception 'Not your payment'; end if;

  select rent, credit_balance into v_rent, v_credit
    from public.tenants where id = v_pay.tenant_id;

  -- Sum of OTHER already-approved payments applied to the same billing period.
  select coalesce(sum(amount), 0) into v_period_paid
    from public.payments
   where tenant_id = v_pay.tenant_id and status = 'approved'
     and id <> p_payment_id and period_from = v_pay.period_from;

  -- This payment first tops the period up to one month's rent; the rest (plus
  -- any existing credit) rolls forward as credit.
  v_needed     := greatest(0, v_rent - v_period_paid);
  v_new_credit := v_credit + greatest(0, v_pay.amount - v_needed);
  v_covered    := (v_period_paid + v_pay.amount) >= v_rent or v_new_credit > 0;
  v_receipt    := public.next_receipt_no();

  update public.payments
     set status = 'approved',
         receipt_no = v_receipt,
         is_advance = (v_new_credit > 0),
         credit_amount = v_new_credit,
         approved_at = now()
   where id = p_payment_id;

  update public.tenants
     set total_paid = total_paid + v_pay.amount,
         credit_balance = v_new_credit,
         status = (case when v_covered then 'paid' else 'due' end)::tenant_status
   where id = v_pay.tenant_id;

  return v_receipt;
end $$;


-- ─────────────────────────────────────────────────────────────────────────
-- 0016_approve_payment_idempotent.sql
-- ─────────────────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════
-- 0016 — make approve_payment idempotent
-- Bug: approving the same payment twice (double-click / re-approve) ran the
-- whole routine again, adding total_paid + credit a second time (e.g. $1400 in
-- payments showed as $2800 paid, $1800 credit). Guard: if the payment is
-- already approved, just return its receipt and change nothing. (Keeps the 0015
-- credit-distribution logic and the tenant_status cast.)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.approve_payment(p_payment_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_pay        public.payments%rowtype;
  v_rent       numeric;
  v_credit     numeric;
  v_period_paid numeric;
  v_needed     numeric;
  v_new_credit numeric;
  v_covered    boolean;
  v_receipt    text;
begin
  select * into v_pay from public.payments where id = p_payment_id;
  if not found then raise exception 'Payment not found'; end if;
  if v_pay.manager_id <> auth.uid() then raise exception 'Not your payment'; end if;

  -- Already approved → do nothing (idempotent). Prevents double-counting.
  if v_pay.status = 'approved' then return v_pay.receipt_no; end if;

  select rent, credit_balance into v_rent, v_credit
    from public.tenants where id = v_pay.tenant_id;

  select coalesce(sum(amount), 0) into v_period_paid
    from public.payments
   where tenant_id = v_pay.tenant_id and status = 'approved'
     and id <> p_payment_id and period_from = v_pay.period_from;

  v_needed     := greatest(0, v_rent - v_period_paid);
  v_new_credit := v_credit + greatest(0, v_pay.amount - v_needed);
  v_covered    := (v_period_paid + v_pay.amount) >= v_rent or v_new_credit > 0;
  v_receipt    := public.next_receipt_no();

  update public.payments
     set status = 'approved',
         receipt_no = v_receipt,
         is_advance = (v_new_credit > 0),
         credit_amount = v_new_credit,
         approved_at = now()
   where id = p_payment_id;

  update public.tenants
     set total_paid = total_paid + v_pay.amount,
         credit_balance = v_new_credit,
         status = (case when v_covered then 'paid' else 'due' end)::tenant_status
   where id = v_pay.tenant_id;

  return v_receipt;
end $$;


-- ─────────────────────────────────────────────────────────────────────────
-- 0017_performance_indexes.sql
-- ─────────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────
-- 0018_payment_credentials.sql
-- ─────────────────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════
-- 0018 — per-workspace payment gateway credentials (Paynow)
--
-- Rent is paid STRAIGHT TO THE LANDLORD: each manager connects their own
-- Paynow merchant account, so RentLoja never holds tenant money.
--
-- These live in their own table rather than on `managers` on purpose — the
-- `managers_visible_to_tenant` policy lets tenants read their manager's row
-- (that's how branding/currency reach the tenant portal), and an integration
-- key must never be readable by a tenant. Nothing here is exposed to tenants
-- at all; the API reads it with the service role when starting a payment.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.payment_credentials (
  manager_id      uuid primary key references public.managers(id) on delete cascade,
  provider        text not null default 'paynow',
  integration_id  text,
  integration_key text,                      -- SECRET: service-role reads only
  live            boolean not null default false,  -- off until the owner tests it
  updated_at      timestamptz not null default now()
);

alter table public.payment_credentials enable row level security;

-- Only the workspace OWNER may see or change their own gateway credentials.
-- (workspace_owner() resolves a staff manager to the owner they belong to.)
drop policy if exists payment_credentials_owner_select on public.payment_credentials;
create policy payment_credentials_owner_select on public.payment_credentials
  for select using (manager_id = public.workspace_owner());

drop policy if exists payment_credentials_owner_write on public.payment_credentials;
create policy payment_credentials_owner_write on public.payment_credentials
  for all using (manager_id = public.workspace_owner())
  with check (manager_id = public.workspace_owner());

-- Where to poll the gateway for this transaction's status.
alter table public.payments add column if not exists gateway_poll_url text;

-- Look up a pending online payment by its gateway reference (webhook path).
create index if not exists idx_payments_gateway_ref on public.payments (gateway_ref)
  where gateway_ref is not null;


-- ─────────────────────────────────────────────────────────────────────────
-- 0019_guard_privileged_columns.sql
-- ─────────────────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════
-- 0019 — managers cannot grant themselves privileges or a paid plan
--
-- SECURITY FIX. Before this, an ordinary manager could update their own row
-- and set:
--   • platform_admin = true  → full access to the App-owner console (every
--     workspace, all revenue, every user) — privilege escalation;
--   • plan_active / plan_capacity / plan_price → a free unlimited plan.
--
-- Fixing only the API is not enough: the anon key ships in the browser bundle,
-- so anyone can call PostgREST directly with their own token. The guard
-- therefore lives in the database, where every path has to go through it.
--
-- Trusted callers still pass:
--   • the service role (our API server, migrations, admin tooling);
--   • a platform admin (that IS the admin console's job).
-- For everyone else the protected columns are silently pinned to their
-- previous values, so a malicious update succeeds but changes nothing.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.guard_manager_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  caller_is_admin boolean;
begin
  -- The service role is our own trusted server-side code.
  if jwt_role = 'service_role' then
    return new;
  end if;

  -- A platform admin may legitimately set these (activating a workspace).
  select coalesce(m.platform_admin, false)
    into caller_is_admin
    from public.managers m
   where m.id = auth.uid();

  if coalesce(caller_is_admin, false) then
    return new;
  end if;

  -- Everyone else: billing and privilege are never self-serve.
  new.platform_admin  := old.platform_admin;
  new.plan_active     := old.plan_active;
  new.plan_capacity   := old.plan_capacity;
  new.plan_price      := old.plan_price;
  new.plan_started_at := old.plan_started_at;

  return new;
end;
$$;

drop trigger if exists trg_guard_manager_privileged on public.managers;
create trigger trg_guard_manager_privileged
  before update on public.managers
  for each row execute function public.guard_manager_privileged_columns();


-- ─────────────────────────────────────────────────────────────────────────
-- 0020_admin_audit.sql
-- ─────────────────────────────────────────────────────────────────────────
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

