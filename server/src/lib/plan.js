// Subscription tiers + activation — server-side source of truth.
// Mirrors src/lib/pricing.js; update both together.
import { admin } from '../supabase.js'

export const PLAN_TIERS = [
  { name: 'Starter', upTo: 5, price: 10 },
  { name: 'Growth', upTo: 20, price: 20 },
  { name: 'Pro', upTo: 50, price: 40 },
  { name: 'Portfolio', upTo: 100, price: 50 },
  { name: 'Enterprise', upTo: Infinity, price: 70 },
]

export const tierFor = (c) => PLAN_TIERS.find((t) => c <= t.upTo) || PLAN_TIERS[PLAN_TIERS.length - 1]

// Flip a workspace to an active PAID plan at the given capacity. Called when a
// real subscription charge settles through the gateway — no trial, and the
// price is taken from the tier (never the client). Service role: migration 0019
// stops managers writing their own plan columns.
export async function activatePaidPlan(owner, capacity, cycle) {
  const tier = tierFor(capacity)
  const { data: cur } = await admin.from('managers').select('plan_started_at').eq('id', owner).maybeSingle()
  await admin.from('managers').update({
    plan_active: true, plan_capacity: capacity, plan_price: tier.price, onboarded: true,
    plan_cycle: cycle === 'yearly' ? 'yearly' : 'monthly',
    plan_started_at: cur?.plan_started_at || new Date().toISOString(),
    plan_canceled_at: null,
    trial_ends_at: null, // a real payment ends any running trial
  }).eq('id', owner)
  return tier
}
