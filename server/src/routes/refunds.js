// Refunds — reverse an approved payment. The refund_payment RPC records the
// refund row and adjusts the tenant's totals/credit atomically.
import { Router } from 'express'
import { h, ok, ownerId } from '../auth.js'

const router = Router()

router.get('/', h(async (req, res) => {
  const manager_id = await ownerId(req)
  res.json(ok(await req.db.from('refunds').select('*').eq('manager_id', manager_id).order('created_at', { ascending: false })))
}))

// POST /api/refunds/:paymentId — refund (all or part of) a payment.
router.post('/:paymentId', h(async (req, res) => {
  const b = req.body || {}
  res.json(ok(await req.db.rpc('refund_payment', {
    p_payment_id: req.params.paymentId, p_amount: b.amount ?? null, p_reason: b.reason || '',
    p_method: b.method || null, p_refunded_on: b.refunded_on || null,
  })))
}))

export default router
