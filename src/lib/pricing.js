// ═══════════════════════════════════════════════════════════════════════════
// Subscription pricing — tiered (banded).
//
// A manager chooses how many tenants they need; the monthly price is set by
// the tier their capacity falls into.
//
//   up to   5 tenants → $10  (Starter)
//   up to  20 tenants → $20  (Growth)
//   up to  50 tenants → $40  (Pro)
//   up to 100 tenants → $50  (Portfolio)
//   100+ tenants      → $70  (Enterprise)
//
// Existing subscribers are NOT repriced: each manager's agreed price is stored
// on their own row (plan_price), so changing this table only affects new
// sign-ups and upgrades.
// ═══════════════════════════════════════════════════════════════════════════

export const PLAN_TIERS = [
  { name: 'Starter',    upTo: 5,        price: 10 },
  { name: 'Growth',     upTo: 20,       price: 20 },
  { name: 'Pro',        upTo: 50,       price: 40 },
  { name: 'Portfolio',  upTo: 100,      price: 50 },
  { name: 'Enterprise', upTo: Infinity, price: 70 },
]

export const MIN_CAPACITY = 1
export const MAX_CAPACITY = 200 // slider ceiling (anything > 100 is the Enterprise tier)

// How many tenants a manager is allowed. WITHOUT an active (paid) plan the
// capacity is 0 — they must subscribe and pay an installment before adding any
// tenants.
export function capacityFor(manager) {
  return manager?.plan_active ? (Number(manager.plan_capacity) || 0) : 0
}

// The tier a given capacity falls into.
export function tierForCapacity(capacity) {
  const c = Math.max(MIN_CAPACITY, Number(capacity) || 0)
  return PLAN_TIERS.find((t) => c <= t.upTo) || PLAN_TIERS[PLAN_TIERS.length - 1]
}

// Monthly price (whole USD) for a given tenant capacity.
export function priceForCapacity(capacity) {
  return tierForCapacity(capacity).price
}

// Quick-pick cards = the tiers.
export const PLAN_PRESETS = PLAN_TIERS.map((t, i) => {
  const from = i === 0 ? 1 : PLAN_TIERS[i - 1].upTo + 1
  const finite = Number.isFinite(t.upTo)
  return {
    name: t.name,
    price: t.price,
    capacity: finite ? t.upTo : MAX_CAPACITY,
    capLabel: finite ? `up to ${t.upTo}` : `${PLAN_TIERS[i - 1].upTo}+`,
    range: finite ? (from === t.upTo ? `up to ${t.upTo}` : `${from}–${t.upTo}`) : `${PLAN_TIERS[i - 1].upTo}+`,
  }
})
