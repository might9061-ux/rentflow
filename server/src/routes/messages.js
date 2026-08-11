// Direct messages inside a workspace.
//
// A conversation always belongs to the workspace owner (manager_id) and has one
// other party: a TENANT or a STAFF agent. Who you're allowed to read or write
// is decided by RLS, not by this file — a party id in the request is only ever
// a lookup key, never a grant.
import { Router } from 'express'
import { h, ok, ownerId } from '../auth.js'
import { admin } from '../supabase.js'
import { pushSafe } from '../push.js'

const router = Router()

const MAX_BODY = 4000

// What kind of account is calling? Tenants and managers are different tables
// keyed by the same auth id, so one lookup each settles it.
async function callerKind(req) {
  const { data: t } = await req.db.from('tenants').select('id').eq('id', req.user.id).maybeSingle()
  if (t) return { kind: 'tenant', id: t.id }
  const { data: m } = await req.db.from('managers').select('id, role, owner_id').eq('id', req.user.id).maybeSingle()
  if (m) return { kind: m.role === 'staff' ? 'staff' : 'owner', id: m.id, ownerId: m.owner_id || m.id }
  return { kind: 'unknown', id: req.user.id }
}

// Is this party a tenant or an agent? Needed to file a message on the right
// column. Read with the service role because a staff member cannot see the
// managers table broadly, but the RLS insert policy still has the final say.
async function partyKind(partyId, workspaceOwner) {
  const { data: t } = await admin.from('tenants').select('id').eq('id', partyId).eq('manager_id', workspaceOwner).maybeSingle()
  if (t) return 'tenant'
  const { data: s } = await admin.from('managers').select('id').eq('id', partyId).eq('owner_id', workspaceOwner).maybeSingle()
  if (s) return 'staff'
  return null
}

// Normalise a row into the shape the UI wants: one "party" per conversation.
const partyOf = (m) => m.tenant_id || m.staff_id

// GET /api/messages?party_id=… — one conversation, oldest first.
// A tenant or agent may omit party_id; they only have their own.
router.get('/', h(async (req, res) => {
  const me = await callerKind(req)
  const partyId = (me.kind === 'tenant' || me.kind === 'staff') && !req.query.party_id ? me.id : req.query.party_id
  if (!partyId) throw new Error('party_id is required')
  const rows = ok(await req.db.from('messages').select('*')
    .or(`tenant_id.eq.${partyId},staff_id.eq.${partyId}`)
    .order('created_at', { ascending: true }))
  res.json(await withSenderNames(rows))
}))

// Attach each message's sender name so every client can show "Manager Might",
// "Agent Might", "Tenant Rudo". Uses the admin client because a tenant's own RLS
// scope can't read the managers table — but they should still see who wrote to
// them. Names of people in your own conversation, nothing more.
async function withSenderNames(rows) {
  const ids = [...new Set(rows.map((r) => r.sender_id).filter(Boolean))]
  if (!ids.length) return rows
  const [mgrs, tens] = await Promise.all([
    admin.from('managers').select('id, first_name, last_name').in('id', ids),
    admin.from('tenants').select('id, first_name, last_name').in('id', ids),
  ])
  const byId = new Map()
  for (const p of (mgrs.data || [])) byId.set(p.id, p)
  for (const p of (tens.data || [])) byId.set(p.id, p)
  return rows.map((r) => {
    const p = byId.get(r.sender_id)
    return { ...r, sender_name: p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : null }
  })
}

// GET /api/messages/threads — conversation list for a manager.
router.get('/threads', h(async (req, res) => {
  const manager_id = await ownerId(req)
  const rows = ok(await req.db.from('messages').select('*').eq('manager_id', manager_id).order('created_at', { ascending: false }))
  const byParty = new Map()
  for (const m of rows) {
    const party = partyOf(m)
    if (!party) continue
    // rows are newest-first, so the first one seen per party is the latest.
    let t = byParty.get(party)
    if (!t) {
      t = { party_id: party, kind: m.staff_id ? 'staff' : 'tenant', last: m, unread: 0 }
      byParty.set(party, t)
    }
    // Unread for the manager = whatever the other side sent.
    if ((m.sender_role === 'tenant' || m.sender_role === 'staff') && !m.read_by_manager) t.unread += 1
  }
  res.json([...byParty.values()])
}))

// GET /api/messages/unread — badge count for whoever is calling.
router.get('/unread', h(async (req, res) => {
  const me = await callerKind(req)
  if (me.kind === 'tenant') {
    const { count } = await req.db.from('messages').select('id', { count: 'exact', head: true })
      .eq('tenant_id', me.id).eq('sender_role', 'manager').eq('read_by_tenant', false)
    return res.json({ unread: count || 0 })
  }
  // A manager's badge covers tenant conversations they can see; a staff agent
  // additionally has their own conversation with the owner.
  const { count: fromOthers } = await req.db.from('messages').select('id', { count: 'exact', head: true })
    .eq('manager_id', await ownerId(req)).in('sender_role', ['tenant', 'staff']).eq('read_by_manager', false)
  let mine = 0
  if (me.kind === 'staff') {
    const { count } = await req.db.from('messages').select('id', { count: 'exact', head: true })
      .eq('staff_id', me.id).eq('sender_role', 'manager').eq('read_by_tenant', false)
    mine = count || 0
  }
  res.json({ unread: (fromOthers || 0) + mine })
}))

// POST /api/messages { party_id?, body, from_assistant? }
router.post('/', h(async (req, res) => {
  const body = String(req.body?.body || '').slice(0, MAX_BODY).trim()
  if (!body) throw new Error('Write a message first.')

  const me = await callerKind(req)
  let row

  if (me.kind === 'tenant') {
    // manager_id comes from the tenant's own row, never the request, so a
    // tenant cannot post into another workspace.
    const t = ok(await req.db.from('tenants').select('manager_id').eq('id', me.id).single())
    row = { manager_id: t.manager_id, tenant_id: me.id, sender_role: 'tenant', sender_id: me.id,
      body, from_assistant: !!req.body?.from_assistant }
  } else if (me.kind === 'staff' && (!req.body?.party_id || req.body.party_id === me.ownerId)) {
    // An agent writing to their own owner.
    row = { manager_id: me.ownerId, staff_id: me.id, sender_role: 'staff', sender_id: me.id, body }
  } else {
    const workspace = await ownerId(req)
    const partyId = req.body?.party_id
    if (!partyId) throw new Error('party_id is required')
    const kind = await partyKind(partyId, workspace)
    if (!kind) throw new Error('Not someone in your workspace')
    row = {
      manager_id: workspace, sender_role: 'manager', sender_id: req.user.id, body,
      ...(kind === 'tenant' ? { tenant_id: partyId } : { staff_id: partyId }),
    }
  }

  const saved = ok(await req.db.from('messages').insert(row).select().single())

  // Pop it up on the other party's phone. Best-effort — the message is stored,
  // and a delivery problem must not look like a send failure.
  const party = partyOf(saved)
  if (saved.sender_role === 'manager') {
    pushSafe(party, {
      title: saved.staff_id ? 'Message from the property owner' : 'Message from your property manager',
      body: body.slice(0, 140),
      url: saved.staff_id ? '/manager/messages' : '/tenant/messages',
      tag: `msg-${party}`,
    })
  } else if (saved.sender_role === 'staff') {
    pushSafe(saved.manager_id, {
      title: 'Message from an agent', body: body.slice(0, 140), url: '/manager/messages', tag: `msg-${party}`,
    })
  } else {
    for (const id of await alertTargets(saved.manager_id, saved.tenant_id)) {
      pushSafe(id, { title: 'New message from a tenant', body: body.slice(0, 140), url: '/manager/messages', tag: `msg-${party}` })
    }
  }

  res.json(saved)
}))

// POST /api/messages/:id/edit { body }
router.post('/:id/edit', h(async (req, res) => {
  const body = String(req.body?.body || '').slice(0, MAX_BODY).trim()
  if (!body) throw new Error('Message cannot be empty.')
  // The function checks that the caller actually sent it and that the edit
  // window is still open — passing an id we don't own simply raises.
  ok(await req.db.rpc('edit_message', { p_id: req.params.id, p_body: body }))
  res.json({ edited: true })
}))

// POST /api/messages/:id/delete — tombstone, not erasure.
router.post('/:id/delete', h(async (req, res) => {
  ok(await req.db.rpc('delete_message', { p_id: req.params.id }))
  res.json({ deleted: true })
}))

// POST /api/messages/read { party_id? }
router.post('/read', h(async (req, res) => {
  const me = await callerKind(req)
  const partyId = (me.kind === 'tenant' || me.kind === 'staff') && !req.body?.party_id ? me.id : req.body?.party_id
  if (!partyId) throw new Error('party_id is required')
  ok(await req.db.rpc('mark_messages_read', { p_tenant_id: partyId }))
  res.json({ ok: true })
}))

// Who should be alerted when a tenant writes?
//
// The agent assigned to that tenant's property — they're the one handling it.
// The owner still SEES every conversation and can step in, but their phone
// stays quiet unless they opted in: on a portfolio with several agents,
// alerting the owner on every tenant message makes the alerts worthless.
// Falls back to the owner when no agent covers the property, so a message is
// never sent into a void.
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
      if (agents?.length) {
        const ids = agents.map((a) => a.id)
        // The owner can opt to be copied in — off by default. Looked up in its
        // OWN try: if this fails (code deployed before 0025 ran) we must still
        // alert the agents rather than silently falling back to the owner.
        try {
          const { data: owner } = await admin.from('managers')
            .select('notify_agent_threads').eq('id', managerId).maybeSingle()
          if (owner?.notify_agent_threads) ids.push(managerId)
        } catch { /* preference unavailable — default is off anyway */ }
        return ids
      }
    }
  } catch (e) {
    console.error('[messages] could not resolve alert targets:', e.message)
  }
  return [managerId]
}

export default router
