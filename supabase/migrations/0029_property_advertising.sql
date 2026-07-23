-- ═══════════════════════════════════════════════════════════════════════════
-- 0029 — public property advertising
--
-- A property can already be flagged is_advertised, but there was no asking rent
-- to show (rent lives on tenants, not properties) and no public contact. These
-- add exactly what a listing needs and nothing more.
--
-- Crucially, this migration does NOT open the properties table to anonymous
-- readers. A public SELECT policy would expose every column — caretaker phone,
-- internal notes, the lot — to the whole internet. Instead the public API
-- endpoint (server/src/routes/publicListings.js) reads with the service role
-- and returns only a hand-picked, advert-safe projection. The privacy boundary
-- lives in one place, in code, not in a broad table grant.
--
-- ad_contact_phone is the number an interested renter reaches on WhatsApp. It
-- is opt-in and separate from anything else so the owner chooses exactly what
-- becomes public — their personal number never leaks by default.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.properties
  add column if not exists ad_rent         numeric(12,2),
  add column if not exists ad_currency     text default 'USD',
  add column if not exists ad_contact_name text,
  add column if not exists ad_contact_phone text,
  add column if not exists advertised_at   timestamptz;

comment on column public.properties.ad_rent is 'Asking rent shown on the public listing (properties have no tenant rent of their own).';
comment on column public.properties.ad_contact_phone is 'Opt-in WhatsApp number shown publicly for enquiries. Never defaulted from anywhere.';

-- Stamp advertised_at the first time a property is put up, for "newest first".
create or replace function public.touch_advertised_at()
returns trigger language plpgsql as $$
begin
  if new.is_advertised and (old.is_advertised is distinct from new.is_advertised) then
    new.advertised_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_touch_advertised_at on public.properties;
create trigger trg_touch_advertised_at
  before update on public.properties
  for each row execute function public.touch_advertised_at();
