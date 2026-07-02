// Payments: tenants submit (pending), managers approve/reject or log directly.
// Approve/reject run through SECURITY DEFINER RPCs so credit/receipt logic and
// authorisation happen in the database.
import { Router } from 'express'
import { h, ok, ownerId } from '../auth.js'

const router = Router()

// GET /api/payments?status=pending — payments in the caller's workspace.
router.get('/', h(async (req, res) => {
  let q = req.db.from('payments').select('*').order('created_at', { ascending: false })
  if (req.query.status) q = q.eq('status', req.query.status)
  res.json(ok(await q))
}))

// GET /api/payments/tenant/:tenantId — one tenant's payment history.
router.get('/tenant/:tenantId', h(async (req, res) => {
  res.json(ok(await req.db.from('payments').select('*')
    .eq('tenant_id', req.params.tenantId).order('created_at', { ascending: false })))
}))

// POST /api/payments — a tenant submits a (pending) payment for themselves.
// manager_id is resolved from the tenant's own row so it can't be spoofed.
router.post('/', h(async (req, res) => {
  const t = ok(await req.db.from('tenants').select('manager_id').eq('id', req.user.id).single())
  const row = { ...req.body, tenant_id: req.user.id, manager_id: t.manager_id, status: 'pending' }
  res.json(ok(await req.db.from('payments').insert(row).select().single()))
}))

// POST /api/payments/online — a tenant submits an online (gateway) payment.
// Stays pending until the gateway webhook confirms it server-side.
router.post('/online', h(async (req, res) => {
  const t = ok(await req.db.from('tenants').select('manager_id').eq('id', req.user.id).single())
  const row = { ...req.body, tenant_id: req.user.id, manager_id: t.manager_id, paid_online: true, status: 'pending' }
  res.json(ok(await req.db.from('payments').insert(row).select().single()))
}))

// POST /api/payments/log — a manager records a payment (e.g. cash) then approves
// it so a receipt is issued immediately.
router.post('/log', h(async (req, res) => {
  const manager_id = await ownerId(req)
  const b = req.body || {}
  const inserted = ok(await req.db.from('payments').insert({
    ...b, manager_id, status: 'pending', recorded_by: 'manager',
  }).select().single())
  ok(await req.db.rpc('approve_payment', { p_payment_id: inserted.id }))
  res.json(ok(await req.db.from('payments').select('*').eq('id', inserted.id).single()))
}))

// POST /api/payments/:id/approve
router.post('/:id/approve', h(async (req, res) => {
  ok(await req.db.rpc('approve_payment', { p_payment_id: req.params.id }))
  res.json(ok(await req.db.from('payments').select('*').eq('id', req.params.id).single()))
}))

// POST /api/payments/:id/reject
router.post('/:id/reject', h(async (req, res) => {
  ok(await req.db.rpc('reject_payment', { p_payment_id: req.params.id, p_reason: req.body?.reason || null }))
  res.json({ rejected: true })
}))

export default router
