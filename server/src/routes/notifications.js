// Notifications a manager sends to tenants (all / a property / an individual).
import { Router } from 'express'
import { h, ok, ownerId } from '../auth.js'

const router = Router()

router.get('/', h(async (req, res) => {
  res.json(ok(await req.db.from('notifications').select('*').order('created_at', { ascending: false })))
}))

// GET /api/notifications/tenant — the caller (a tenant) sees their workspace's
// notices, each flagged read/unread for them.
router.get('/tenant', h(async (req, res) => {
  const notifs = ok(await req.db.from('notifications').select('*').order('created_at', { ascending: false }))
  const reads = ok(await req.db.from('notification_reads').select('notification_id').eq('tenant_id', req.user.id))
  const readSet = new Set(reads.map((r) => r.notification_id))
  res.json(notifs.map((n) => ({ ...n, read: readSet.has(n.id) })))
}))

// GET /api/notifications/unread-count — unread notices for the caller (tenant).
router.get('/unread-count', h(async (req, res) => {
  const notifs = ok(await req.db.from('notifications').select('id'))
  const reads = ok(await req.db.from('notification_reads').select('notification_id').eq('tenant_id', req.user.id))
  const readSet = new Set(reads.map((r) => r.notification_id))
  res.json({ unread: notifs.filter((n) => !readSet.has(n.id)).length })
}))

router.post('/', h(async (req, res) => {
  const manager_id = await ownerId(req)
  res.json(ok(await req.db.from('notifications').insert({ ...req.body, manager_id }).select().single()))
}))

// A tenant marks a notification read (via the SECURITY DEFINER RPC).
router.post('/:id/read', h(async (req, res) => {
  ok(await req.db.rpc('mark_notification_read', { p_notification_id: req.params.id }))
  res.json({ read: true })
}))

export default router
