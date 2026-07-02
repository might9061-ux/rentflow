// Automated rent-reminder log + snooze. Reminders themselves are computed on the
// client (and, in production, by a scheduled job); this stores what was sent and
// which tenants are snoozed for the current period.
import { Router } from 'express'
import { h, ok, ownerId } from '../auth.js'

const router = Router()

// GET /api/reminders/log — reminder history for the workspace.
router.get('/log', h(async (req, res) => {
  const manager_id = await ownerId(req)
  res.json(ok(await req.db.from('reminder_log').select('*').eq('manager_id', manager_id).order('created_at', { ascending: false })))
}))

// POST /api/reminders/log — record that a reminder was sent.
router.post('/log', h(async (req, res) => {
  const manager_id = await ownerId(req)
  res.json(ok(await req.db.from('reminder_log').insert({ manager_id, ...req.body }).select().single()))
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
