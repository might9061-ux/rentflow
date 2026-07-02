// Payroll — the workspace's workers (payees) and the payments made to them.
// Only the owner (or a staff member granted can_payroll) reaches these; the
// pay_staff RPC records the payment and its Salaries expense atomically.
import { Router } from 'express'
import { h, ok, ownerId } from '../auth.js'

const router = Router()

router.get('/payees', h(async (req, res) => {
  const manager_id = await ownerId(req)
  res.json(ok(await req.db.from('payees').select('*').eq('manager_id', manager_id).order('created_at', { ascending: false })))
}))

router.post('/payees', h(async (req, res) => {
  const manager_id = await ownerId(req)
  const b = req.body || {}
  res.json(ok(await req.db.from('payees').insert({ manager_id, ...b, amount: Number(b.amount) || 0, active: true }).select().single()))
}))

router.patch('/payees/:id', h(async (req, res) => {
  res.json(ok(await req.db.from('payees').update(req.body || {}).eq('id', req.params.id).select().single()))
}))

router.delete('/payees/:id', h(async (req, res) => {
  ok(await req.db.from('payees').delete().eq('id', req.params.id))
  res.json({ deleted: true })
}))

router.get('/', h(async (req, res) => {
  const manager_id = await ownerId(req)
  res.json(ok(await req.db.from('payroll').select('*').eq('manager_id', manager_id).order('created_at', { ascending: false })))
}))

// POST /api/payroll/pay/:payeeId — pay a worker.
router.post('/pay/:payeeId', h(async (req, res) => {
  const b = req.body || {}
  res.json(ok(await req.db.rpc('pay_staff', {
    p_payee_id: req.params.payeeId, p_amount: Number(b.amount) || 0, p_period: b.period || '',
    p_method: b.method || 'Bank Transfer', p_paid_on: b.paid_on || null, p_note: b.note || '',
  })))
}))

export default router
