// Manager profile + team (staff) management. All reads/writes run under the
// caller's RLS via req.db, so a manager can only ever see their own workspace.
import { Router } from 'express'
import { h, ok, ownerId } from '../auth.js'
import { admin } from '../supabase.js'

const router = Router()

// GET /api/managers/me — the signed-in manager's profile.
router.get('/me', h(async (req, res) => {
  res.json(ok(await req.db.from('managers').select('*').eq('id', req.user.id).single()))
}))

// GET /api/managers/workspace — the OWNER profile for the caller's workspace
// (their own row if an owner, or their owner's row if staff). Carries the
// workspace currency, plan, branding and reminder settings.
router.get('/workspace', h(async (req, res) => {
  const me = ok(await req.db.from('managers').select('owner_id').eq('id', req.user.id).single())
  const ownerId = me?.owner_id || req.user.id
  res.json(ok(await req.db.from('managers').select('*').eq('id', ownerId).single()))
}))

// Columns a manager may never set on themselves: privilege and billing. The
// database enforces this too (migration 0019) since the anon key is public and
// callers can reach PostgREST directly — this is defence in depth, and it fails
// loudly here so a buggy client doesn't silently "succeed".
const PROTECTED_FIELDS = ['platform_admin', 'plan_active', 'plan_capacity', 'plan_price', 'plan_started_at', 'trial_ends_at', 'plan_canceled_at']

const PLAN_SELECT = 'id, plan_active, plan_capacity, plan_price, plan_started_at, trial_ends_at, plan_canceled_at'
const DAY = 86400000

// PATCH /api/managers/me — update settings on the caller's own profile.
router.patch('/me', h(async (req, res) => {
  const patch = { ...(req.body || {}) }
  const attempted = PROTECTED_FIELDS.filter((f) => f in patch)
  if (attempted.length) {
    return res.status(403).json({ error: `Not allowed to change: ${attempted.join(', ')}` })
  }
  res.json(ok(await req.db.from('managers').update(patch).eq('id', req.user.id).select().single()))
}))

// Subscription tiers — kept server-side so the price can't be chosen by the
// caller. Mirrors src/lib/pricing.js; update both together.
const PLAN_TIERS = [
  { name: 'Starter', upTo: 5, price: 10 },
  { name: 'Growth', upTo: 20, price: 20 },
  { name: 'Pro', upTo: 50, price: 40 },
  { name: 'Portfolio', upTo: 100, price: 50 },
  { name: 'Enterprise', upTo: Infinity, price: 70 },
]
const tierFor = (c) => PLAN_TIERS.find((t) => c <= t.upTo) || PLAN_TIERS[PLAN_TIERS.length - 1]

// POST /api/managers/me/plan — a manager starts/changes their OWN plan.
//
// TEMPORARY: this is self-serve on trust — it grants access before any money
// arrives, and records no payment (nothing was taken). It exists so landlords
// aren't blocked waiting for a manual activation. When Paynow is connected this
// should require a confirmed charge before flipping plan_active.
//
// Uses the service role deliberately: migration 0019 stops managers writing
// their own plan columns, so this endpoint is the single controlled way in. The
// price is derived from capacity here, never taken from the client.
router.post('/me/plan', h(async (req, res) => {
  const capacity = Math.floor(Number(req.body?.capacity) || 0)
  if (!Number.isFinite(capacity) || capacity < 1) throw new Error('Choose how many tenants you need.')
  if (capacity > 500) throw new Error('That capacity is too large — please contact support.')

  const owner = await ownerId(req)
  const tier = tierFor(capacity)

  // Never let a workspace drop below the tenants it already has.
  const { count } = await admin.from('tenants').select('id', { count: 'exact', head: true }).eq('manager_id', owner)
  if (capacity < (count || 0)) throw new Error(`You already have ${count} tenants — choose at least that many.`)

  const { data: cur } = await admin.from('managers').select('plan_started_at, plan_active, trial_ends_at').eq('id', owner).maybeSingle()
  const patch = {
    plan_active: true, plan_capacity: capacity, plan_price: tier.price, onboarded: true,
    plan_started_at: cur?.plan_started_at || new Date().toISOString(),
    plan_canceled_at: null, // (re)activating clears any pending cancellation
  }
  // A 7-day free trial is only granted on a genuinely fresh start (not already
  // active, and hasn't used a trial before). The card is saved by the client; no
  // charge is recorded here.
  if (req.body?.trial === true && !cur?.plan_active && !cur?.trial_ends_at) {
    patch.trial_ends_at = new Date(Date.now() + 7 * DAY).toISOString()
  }
  res.json(ok(await admin.from('managers').update(patch).eq('id', owner).select(PLAN_SELECT).single()))
}))

// POST /api/managers/me/plan/cancel — cancel at period end (no auto-renew).
// Access continues until the current paid period ends; no refund is given.
router.post('/me/plan/cancel', h(async (req, res) => {
  const owner = await ownerId(req)
  const { data: cur } = await admin.from('managers').select('plan_active').eq('id', owner).maybeSingle()
  if (!cur?.plan_active) throw new Error('You have no active plan to cancel.')
  res.json(ok(await admin.from('managers').update({ plan_canceled_at: new Date().toISOString() })
    .eq('id', owner).select(PLAN_SELECT).single()))
}))

// POST /api/managers/me/plan/resume — undo a pending cancellation.
router.post('/me/plan/resume', h(async (req, res) => {
  const owner = await ownerId(req)
  res.json(ok(await admin.from('managers').update({ plan_canceled_at: null })
    .eq('id', owner).select(PLAN_SELECT).single()))
}))

// GET /api/managers/team — staff managers under this owner.
router.get('/team', h(async (req, res) => {
  res.json(ok(await req.db.from('managers').select('*')
    .eq('owner_id', req.user.id).eq('role', 'staff').order('created_at', { ascending: false })))
}))

// PATCH /api/managers/team/:id — update a staff member (e.g. property assignments).
router.patch('/team/:id', h(async (req, res) => {
  res.json(ok(await req.db.from('managers').update(req.body || {}).eq('id', req.params.id).select().single()))
}))

// DELETE /api/managers/team/:id — remove a staff member's profile row.
router.delete('/team/:id', h(async (req, res) => {
  ok(await req.db.from('managers').delete().eq('id', req.params.id))
  res.json({ deleted: true })
}))

export default router
