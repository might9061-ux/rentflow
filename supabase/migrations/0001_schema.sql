-- ═══════════════════════════════════════════════════════════════════════════
-- RentFlow — 0001 schema
-- Core tables for managers, properties, tenants, payments, notifications.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── Enums ──────────────────────────────────────────────────────────────────
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

-- ── managers ───────────────────────────────────────────────────────────────
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
  payment_details jsonb not null default '{}'::jsonb,  -- per-method destination info (bank acct, InnBucks no…)
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
  method      text,                      -- e.g. 'Visa ····4242'
  reference   text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_sub_payments_manager on public.subscription_payments(manager_id);

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

-- ── expenses (manager-side costs for the revenue-vs-cost dashboard) ─────────
create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  manager_id  uuid not null references public.managers(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  category    text not null,             -- Maintenance, Utilities, Rates, Other…
  amount      numeric(12,2) not null check (amount >= 0),
  spent_on    date not null default current_date,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_expenses_manager on public.expenses(manager_id);

-- ── properties ─────────────────────────────────────────────────────────────
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
  floor_size  numeric(10,1),              -- m²
  stand_size  numeric(10,1),              -- m²
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

-- ── tenants ────────────────────────────────────────────────────────────────
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

-- ── payments ───────────────────────────────────────────────────────────────
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

-- ── notifications ──────────────────────────────────────────────────────────
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

-- ── notification_reads ─────────────────────────────────────────────────────
create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, tenant_id)
);

-- ── otp_codes (used by the SMS/email OTP RPC stub) ─────────────────────────
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
