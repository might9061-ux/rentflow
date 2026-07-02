// Maintenance / repair requests. Tenants create; managers triage and resolve.
import { Router } from 'express'
import { h, ok } from '../auth.js'

const router = Router()

router.get('/', h(async (req, res) => {
  res.json(ok(await req.db.from('maintenance').select('*').order('created_at', { ascending: false })))
}))

// Tenant creates a request. manager_id / property_id / unit are derived from the
// tenant's own row (RLS lets a tenant read themselves and insert their own
// request), so the client can't spoof another workspace.
router.post('/', h(async (req, res) => {
  const b = req.body || {}
  if (!b.title) throw new Error('title is required')
  const t = ok(await req.db.from('tenants').select('manager_id, property_id, unit').eq('id', req.user.id).single())
  const row = {
    tenant_id: req.user.id, manager_id: t.manager_id, property_id: t.property_id ?? null, unit: t.unit ?? null,
    title: b.title, category: b.category || 'General', description: b.description || '',
    photo_url: b.photo_url || null, priority: b.priority || 'normal', status: 'open',
  }
  res.json(ok(await req.db.from('maintenance').insert(row).select().single()))
}))

// Manager updates status / cost / caretaker etc.
router.patch('/:id', h(async (req, res) => {
  const patch = { ...req.body, updated_at: new Date().toISOString() }
  res.json(ok(await req.db.from('maintenance').update(patch).eq('id', req.params.id).select().single()))
}))

export default router
