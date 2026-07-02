// Manager-side costs for the revenue-vs-cost dashboard.
import { Router } from 'express'
import { h, ok, ownerId } from '../auth.js'

const router = Router()

router.get('/', h(async (req, res) => {
  res.json(ok(await req.db.from('expenses').select('*').order('spent_on', { ascending: false })))
}))

router.post('/', h(async (req, res) => {
  const manager_id = await ownerId(req)
  res.json(ok(await req.db.from('expenses').insert({ ...req.body, manager_id }).select().single()))
}))

router.delete('/:id', h(async (req, res) => {
  ok(await req.db.from('expenses').delete().eq('id', req.params.id))
  res.json({ deleted: true })
}))

export default router
