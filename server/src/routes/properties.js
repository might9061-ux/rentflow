// Properties CRUD. RLS scopes every row to the caller's workspace.
import { Router } from 'express'
import { h, ok, ownerId } from '../auth.js'

const router = Router()

router.get('/', h(async (req, res) => {
  res.json(ok(await req.db.from('properties').select('*').order('created_at')))
}))

router.get('/:id', h(async (req, res) => {
  res.json(ok(await req.db.from('properties').select('*').eq('id', req.params.id).single()))
}))

router.post('/', h(async (req, res) => {
  const manager_id = await ownerId(req)
  res.json(ok(await req.db.from('properties').insert({ ...req.body, manager_id }).select().single()))
}))

router.patch('/:id', h(async (req, res) => {
  res.json(ok(await req.db.from('properties').update(req.body || {}).eq('id', req.params.id).select().single()))
}))

router.delete('/:id', h(async (req, res) => {
  ok(await req.db.from('properties').delete().eq('id', req.params.id))
  res.json({ deleted: true })
}))

export default router
