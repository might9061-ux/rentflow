// Tenant reads/updates. Creating a tenant (which needs an auth account) lives
// in routes/admin.js — this file covers listing, fetching and editing.
import { Router } from 'express'
import { admin } from '../supabase.js'
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
