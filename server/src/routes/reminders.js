// Automated rent-reminder log + snooze. Reminders themselves are computed on the
// client (and, in production, by a scheduled job); this stores what was sent and
// which tenants are snoozed for the current period.
import { Router } from 'express'
import { h, ok, ownerId } from '../auth.js'
import { pushSafe } from '../push.js'

const router = Router()

// Overdue rent is the one thing that should stay on the lock screen until the
// tenant deals with it; everything earlier in the ladder is a nudge.
const PRIORITY_BY_KIND = { overdue: 'urgent', due: 'normal', upcoming: 'info' }

// GET /api/reminders/log — reminder history for the workspace.
router.get('/log', h(async (req, res) => {
  const manager_id = await ownerId(req)
  res.json(ok(await req.db.from('reminder_log').select('*').eq('manager_id', manager_id).order('created_at', { ascending: false })))
}))

// POST /api/reminders/log — record that a reminder was sent.
//
// A reminder that only exists on WhatsApp is easy to lose in a busy chat list,
// so the same message is also dropped into the tenant's in-app inbox and pushed
// to their phone as a pop-up. Both are extras: if either fails the reminder is
// still recorded as sent, because it genuinely was.
router.post('/log', h(async (req, res) => {
  const manager_id = await ownerId(req)
  const { subject, message, kind, ...entry } = req.body || {}
  const log = ok(await req.db.from('reminder_log').insert({ manager_id, ...entry }).select().single())

  if (message && entry.tenant_id) {
    const priority = PRIORITY_BY_KIND[kind] || 'normal'
    try {
      ok(await req.db.from('notifications').insert({
        manager_id,
        recipient_scope: 'individual',
        tenant_id: entry.tenant_id,
        subject: subject || 'Rent reminder',
        message,
        priority,
      }))
    } catch (e) {
      console.error('[reminders] could not save in-app notice:', e.message)
    }
    // A tenant's auth user id IS their tenants.id, so this reaches their devices.
    pushSafe(entry.tenant_id, {
      title: subject || 'Rent reminder',
      body: message,
      url: '/tenant/notifications',
      // One pop-up per tenant per billing period — a second reminder for the
      // same month replaces the first instead of stacking up.
      tag: `rent-${entry.period || 'now'}`,
      priority,
    })
  }

  res.json(log)
}))

// POST /api/reminders/snooze { tenant_id, period } — skip a tenant this period.
router.post('/snooze', h(async (req, res) => {
  const manager_id = await ownerId(req)
  const { tenant_id, period } = req.body || {}
  res.json(ok(await req.db.from('reminder_log').upsert(
    { manager_id, tenant_id, rule_id: 'snooze', period, channel: '-', amount: 0 },
    { onConflict: 'manager_id,tenant_id,rule_id,period' },
  )))
}))

// DELETE /api/reminders/snooze { tenant_id, period } — resume reminders.
router.delete('/snooze', h(async (req, res) => {
  const manager_id = await ownerId(req)
  const { tenant_id, period } = req.body || {}
  ok(await req.db.from('reminder_log').delete()
    .eq('manager_id', manager_id).eq('tenant_id', tenant_id).eq('rule_id', 'snooze').eq('period', period))
  res.json({ resumed: true })
}))

export default router
