// Manager profile + team (staff) management. All reads/writes run under the
// caller's RLS via req.db, so a manager can only ever see their own workspace.
import { Router } from 'express'
import { h, ok } from '../auth.js'

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
