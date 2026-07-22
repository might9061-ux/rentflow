// Direct messages between a tenant and their property manager.
//
// One conversation per tenant. Which conversation you're allowed to touch is
// decided by RLS, not by this file — a tenant_id in the request body is only
// ever a lookup key, never a grant.
import { Router } from 'express'
import { h, ok, ownerId } from '../auth.js'
import { admin } from '../supabase.js'
import { pushSafe } from '../push.js'

const router = Router()

const MAX_BODY = 4000

// Who should be alerted when a tenant writes?
//
// The agent assigned to that tenant's property — they're the one handling it.
// The owner still SEES every conversation (RLS gives them the whole workspace)
// and can step in, but their phone stays quiet: on a portfolio with several
// agents, alerting the owner on every tenant message makes the alerts
// worthless. Falls back to the owner when no agent covers the property, so a
// message is never sent into a void.
//
// Uses the service role because the sender is a tenant, and a tenant's own RLS
// scope cannot see the managers table.
async function alertTargets(managerId, tenantId) {
  try {
    const { data: t } = await admin.from('tenants').select('property_id').eq('id', tenantId).maybeSingle()
    if (t?.property_id) {
      const { data: agents } = await admin.from('managers').select('id')
        .eq('owner_id', managerId).eq('role', 'staff').eq('account_status', 'active')
        .contains('assigned_property_ids', [t.property_id])
      if (agents?.length) return agents.map((a) => a.id)
    }
  } catch (e) {
    console.error('[messages] could not resolve alert targets:', e.message)
  }
  return [managerId]
}

// Is the caller a tenant? Tenants and managers live in different tables, both
// keyed by their auth id, so this is the cheap way to tell them apart.
async function callerTenantId(req) {
  const { data } = await req.db.from('tenants').select('id').eq('id', req.user.id).maybeSingle()
  return data?.id || null
}

// GET /api/messages?tenant_id=… — one conversation, oldest first.
// A tenant may omit tenant_id; they only ever have their own.
router.get('/', h(async (req, res) => {
  const asTenant = await callerTenantId(req)
  const tenantId = asTenant || req.query.tenant_id
  if (!tenantId) throw new Error('tenant_id is required')
  res.json(ok(await req.db.from('messages').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: true })))
}))

// GET /api/messages/threads — manager's conversation list: who, last message,
// how many unread. Built from one query rather than N.
router.get('/threads', h(async (req, res) => {
  const manager_id = await ownerId(req)
  const rows = ok(await req.db.from('messages').select('*').eq('manager_id', manager_id).order('created_at', { ascending: false }))
  const byTenant = new Map()
  for (const m of rows) {
    // rows are newest-first, so the first one seen per tenant is the latest.
    let t = byTenant.get(m.tenant_id)
    if (!t) { t = { tenant_id: m.tenant_id, last: m, unread: 0 }; byTenant.set(m.tenant_id, t) }
    if (m.sender_role === 'tenant' && !m.read_by_manager) t.unread += 1
  }
  res.json([...byTenant.values()])
}))

// GET /api/messages/unread — badge count for whoever is calling.
router.get('/unread', h(async (req, res) => {
  const asTenant = await callerTenantId(req)
  const q = req.db.from('messages').select('id', { count: 'exact', head: true })
  const { count } = asTenant
    ? await q.eq('tenant_id', asTenant).eq('sender_role', 'manager').eq('read_by_tenant', false)
    : await q.eq('manager_id', await ownerId(req)).eq('sender_role', 'tenant').eq('read_by_manager', false)
  res.json({ unread: count || 0 })
}))

// POST /api/messages { tenant_id?, body, from_assistant? }
router.post('/', h(async (req, res) => {
  const body = String(req.body?.body || '').slice(0, MAX_BODY).trim()
  if (!body) throw new Error('Write a message first.')

  const asTenant = await callerTenantId(req)
  let row
  if (asTenant) {
    // manager_id comes from the tenant's own row, never from the request, so a
    // tenant cannot post into another workspace.
    const t = ok(await req.db.from('tenants').select('manager_id, first_name, last_name').eq('id', asTenant).single())
    row = {
      manager_id: t.manager_id, tenant_id: asTenant, sender_role: 'tenant', sender_id: req.user.id,
      body, from_assistant: !!req.body?.from_assistant,
    }
  } else {
    const tenant_id = req.body?.tenant_id
    if (!tenant_id) throw new Error('tenant_id is required')
    row = {
      manager_id: await ownerId(req), tenant_id, sender_role: 'manager', sender_id: req.user.id,
      body, from_assistant: false,
    }
  }

  const saved = ok(await req.db.from('messages').insert(row).select().single())

  // Pop it up on the other party's phone. Best-effort — the message is already
  // stored, and a delivery problem must not look like a send failure.
  if (saved.sender_role === 'tenant') {
    for (const id of await alertTargets(saved.manager_id, saved.tenant_id)) {
      pushSafe(id, {
        title: 'New message from a tenant',
        body: body.slice(0, 140),
        url: '/manager/messages',
        tag: `msg-${saved.tenant_id}`,
      })
    }
  } else {
    pushSafe(saved.tenant_id, {
      title: 'Message from your property manager',
      body: body.slice(0, 140),
      url: '/tenant/messages',
      tag: `msg-${saved.tenant_id}`,
    })
  }

  res.json(saved)
}))

// POST /api/messages/read { tenant_id? } — mark the other side's messages read.
router.post('/read', h(async (req, res) => {
  const asTenant = await callerTenantId(req)
  const tenantId = asTenant || req.body?.tenant_id
  if (!tenantId) throw new Error('tenant_id is required')
  // The function decides what the caller is allowed to mark; passing an id we
  // don't own is simply a no-op.
  ok(await req.db.rpc('mark_messages_read', { p_tenant_id: tenantId }))
  res.json({ ok: true })
}))

export default router
