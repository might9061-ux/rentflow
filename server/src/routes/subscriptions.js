// The manager's own plan/installment payments (their subscription to RentFlow).
import { Router } from 'express'
import { h, ok, ownerId } from '../auth.js'

const router = Router()

router.get('/', h(async (req, res) => {
  const manager_id = await ownerId(req)
  res.json(ok(await req.db.from('subscription_payments').select('*').eq('manager_id', manager_id).order('created_at', { ascending: false })))
}))

router.post('/', h(async (req, res) => {
  const manager_id = await ownerId(req)
  res.json(ok(await req.db.from('subscription_payments').insert({ manager_id, ...req.body }).select().single()))
}))

export default router
