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

// PATCH /api/managers/me — update settings on the caller's own profile.
router.patch('/me', h(async (req, res) => {
  res.json(ok(await req.db.from('managers').update(req.body || {}).eq('id', req.user.id).select().single()))
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
