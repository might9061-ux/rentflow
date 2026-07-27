// Tenant reads/updates. Creating a tenant (which needs an auth account) lives
// in routes/admin.js — this file covers listing, fetching and editing.
import { Router } from 'express'
import { admin, verifyPassword } from '../supabase.js'
import { h, ok } from '../auth.js'

const router = Router()

router.get('/', h(async (req, res) => {
  res.json(ok(await req.db.from('tenants').select('*').order('created_at')))
}))

// GET /api/tenants/me/manager — the caller's (tenant's) manager profile, for
// branding + currency in the tenant portal. Fetched with the service-role
// client but strictly scoped to the tenant's own manager_id.
router.get('/me/manager', h(async (req, res) => {
  const me = ok(await req.db.from('tenants').select('manager_id').eq('id', req.user.id).single())
  res.json(ok(await admin.from('managers').select('*').eq('id', me.manager_id).single()))
}))

// POST /api/tenants/me/delete — a tenant permanently deletes their own account.
// Password-verified. Removes the tenancy record (payments cascade off it) and
// the auth login.
router.post('/me/delete', h(async (req, res) => {
  const password = String(req.body?.password || '')
  if (!password) throw new Error('Enter your password to delete your account.')
  const me = ok(await admin.from('tenants').select('email').eq('id', req.user.id).single())
  if (!me?.email) throw new Error('Account not found.')
  if (!(await verifyPassword(me.email, password))) {
    return res.status(401).json({ error: 'Password is incorrect.' })
  }
  await admin.from('tenants').delete().eq('id', req.user.id)
  await admin.auth.admin.deleteUser(req.user.id)
  res.json({ deleted: true })
}))

router.get('/:id', h(async (req, res) => {
  res.json(ok(await req.db.from('tenants').select('*').eq('id', req.params.id).single()))
}))

router.patch('/:id', h(async (req, res) => {
  res.json(ok(await req.db.from('tenants').update(req.body || {}).eq('id', req.params.id).select().single()))
}))

router.delete('/:id', h(async (req, res) => {
  ok(await req.db.from('tenants').delete().eq('id', req.params.id))
  res.json({ deleted: true })
}))

export default router
