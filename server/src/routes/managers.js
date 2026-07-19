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
const PROTECTED_FIELDS = ['platform_admin', 'plan_active', 'plan_capacity', 'plan_price', 'plan_started_at']

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

  const { data: cur } = await admin.from('managers').select('plan_started_at').eq('id', owner).maybeSingle()
  const patch = {
    plan_active: true, plan_capacity: capacity, plan_price: tier.price, onboarded: true,
    plan_started_at: cur?.plan_started_at || new Date().toISOString(),
  }
  res.json(ok(await admin.from('managers').update(patch).eq('id', owner)
    .select('id, plan_active, plan_capacity, plan_price, plan_started_at').single()))
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
