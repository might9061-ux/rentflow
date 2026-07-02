// Questions tenants ask the AI assistant, surfaced to their manager.
import { Router } from 'express'
import { h, ok, ownerId } from '../auth.js'

const router = Router()

// GET /api/tenant-questions — the manager reads their workspace's questions.
router.get('/', h(async (req, res) => {
  const manager_id = await ownerId(req)
  res.json(ok(await req.db.from('tenant_questions').select('*').eq('manager_id', manager_id).order('created_at', { ascending: false })))
}))

// GET /api/tenant-questions/unread — count for the manager's badge.
router.get('/unread', h(async (req, res) => {
  const manager_id = await ownerId(req)
  const { count } = await req.db.from('tenant_questions').select('id', { count: 'exact', head: true })
    .eq('manager_id', manager_id).eq('read_by_manager', false)
  res.json({ unread: count || 0 })
}))

// POST /api/tenant-questions — a tenant logs a Q&A. manager_id is taken from the
// tenant's own row so it can't be spoofed.
router.post('/', h(async (req, res) => {
  const b = req.body || {}
  const t = ok(await req.db.from('tenants').select('manager_id').eq('id', req.user.id).single())
  res.json(ok(await req.db.from('tenant_questions').insert({
    manager_id: t.manager_id, tenant_id: req.user.id, question: b.question, answer: b.answer ?? null,
  }).select().single()))
}))

// POST /api/tenant-questions/read — manager marks all read.
router.post('/read', h(async (req, res) => {
  const manager_id = await ownerId(req)
  ok(await req.db.from('tenant_questions').update({ read_by_manager: true })
    .eq('manager_id', manager_id).eq('read_by_manager', false))
  res.json({ ok: true })
}))

export default router
