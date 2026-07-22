// Notifications a manager sends to tenants (all / a property / an individual).
import { Router } from 'express'
import { h, ok, ownerId } from '../auth.js'
import { pushSafe } from '../push.js'

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
  const notice = ok(await req.db.from('notifications').insert({ ...req.body, manager_id }).select().single())

  // Also raise it as a pop-up on each recipient's phone. Best-effort: the notice
  // is already saved, and a push failure must not make the manager think the
  // send failed.
  try {
    for (const tenantId of await recipientIds(req, notice)) {
      pushSafe(tenantId, {
        title: notice.subject,
        body: notice.message,
        url: '/tenant/notifications',
        tag: `notice-${notice.id}`,
        priority: notice.priority,
      })
    }
  } catch (e) {
    console.error('[notifications] could not resolve push recipients:', e.message)
  }

  res.json(notice)
}))

// Which tenants a notice is addressed to. Read under the caller's own RLS, so a
// staff manager can only ever reach the tenants they're allowed to see.
async function recipientIds(req, notice) {
  if (notice.recipient_scope === 'individual') return notice.tenant_id ? [notice.tenant_id] : []
  let q = req.db.from('tenants').select('id').eq('account_status', 'active')
  if (notice.recipient_scope === 'property') {
    if (!notice.property_id) return []
    q = q.eq('property_id', notice.property_id)
  }
  return ok(await q).map((t) => t.id)
}

// A tenant marks a notification read (via the SECURITY DEFINER RPC).
router.post('/:id/read', h(async (req, res) => {
  ok(await req.db.rpc('mark_notification_read', { p_notification_id: req.params.id }))
  res.json({ read: true })
}))

export default router
