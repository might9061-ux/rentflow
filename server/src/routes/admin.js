// Privileged actions that require the service-role key (creating auth users,
// resetting passwords). These are the ones a browser can't do safely.
import { Router } from 'express'
import { admin } from '../supabase.js'
import { h, ok } from '../auth.js'

const router = Router()

function tempPassword() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)]
  return `TEMP-${s}`
}

// Resolve the caller's workspace owner id + manager row (RLS-safe: uses the
// caller's own scoped client so they can only read their own manager record).
async function callerManager(req) {
  const m = ok(await req.db.from('managers').select('*').eq('id', req.user.id).single())
  const ownerId = m.owner_id || m.id
  return { manager: m, ownerId }
}

// POST /api/admin/tenants — create a tenant's LOGIN account + profile row.
// Returns { tenant_id, temp_password } (the frontend shows the temp password
// to the manager for the WhatsApp handoff, and it actually works for sign-in).
router.post('/tenants', h(async (req, res) => {
  const { manager, ownerId } = await callerManager(req)
  const b = req.body || {}
  if (!b.email || !b.first_name || !b.last_name) throw new Error('first_name, last_name and email are required')

  // Plan-capacity guard — always against the OWNER's plan. An agent has no plan
  // of their own (plan_active is false on their row), so using the caller's row
  // would wrongly block every agent from adding tenants.
  const owner = manager.owner_id
    ? (await admin.from('managers').select('plan_active, plan_capacity').eq('id', ownerId).single()).data
    : manager
  const { count } = await admin.from('tenants').select('id', { count: 'exact', head: true }).eq('manager_id', ownerId)
  const cap = owner?.plan_active ? (owner.plan_capacity || 0) : 0
  if ((count || 0) >= cap) {
    throw new Error(`This workspace has reached its tenant capacity (${count || 0} of ${cap}). The account owner needs to upgrade the plan.`)
  }

  const pw = tempPassword()
  const created = await admin.auth.admin.createUser({
    email: String(b.email).toLowerCase(),
    password: pw,
    email_confirm: true, // in-app verification handles the "verified" flags
    user_metadata: { role: 'tenant', first_name: b.first_name, last_name: b.last_name },
  })
  if (created.error) throw new Error(created.error.message)
  const tenantId = created.data.user.id

  const profile = await admin.from('tenants').insert({
    id: tenantId, manager_id: ownerId, property_id: b.property_id ?? null,
    first_name: b.first_name, last_name: b.last_name, email: String(b.email).toLowerCase(),
    phone: b.phone ?? null, unit: b.unit ?? null, rent: Number(b.rent) || 0,
    details: b.details ?? {},
    due_day: Number(b.due_day) || 1, lease_start: b.lease_start ?? null,
    status: 'pending', account_status: 'pending_verification',
    first_login: true, email_verified: false, phone_verified: false,
    // Starts the temp password's clock: single-use, and dead after a week.
    temp_password_issued_at: new Date().toISOString(), temp_password_used_at: null,
  })
  if (profile.error) {
    await admin.auth.admin.deleteUser(tenantId) // rollback the orphaned auth user
    throw new Error(profile.error.message)
  }
  res.json({ tenant_id: tenantId, temp_password: pw })
}))

// POST /api/admin/tenants/:id/resend-credentials — reset a tenant's password.
router.post('/tenants/:id/resend-credentials', h(async (req, res) => {
  const { ownerId } = await callerManager(req)
  const t = ok(await req.db.from('tenants').select('id, manager_id').eq('id', req.params.id).single())
  if (t.manager_id !== ownerId) throw new Error('Not your tenant')

  const pw = tempPassword()
  const upd = await admin.auth.admin.updateUserById(req.params.id, { password: pw })
  if (upd.error) throw new Error(upd.error.message)
  await admin.from('tenants').update({
    // Back on a manager-issued password, so they must pick their own again.
    // Their email/phone verification and account_status are NOT touched: those
    // describe their contact details, not their password. Wiping them here is
    // what silently dragged verified, active tenants back to unverified.
    first_login: true,
    // A brand-new temp password, so its clock restarts and it is unused again.
    temp_password_issued_at: new Date().toISOString(), temp_password_used_at: null,
  }).eq('id', req.params.id)
  res.json({ tempPassword: pw })
}))

// POST /api/admin/staff — create a staff manager account under the owner.
router.post('/staff', h(async (req, res) => {
  const { manager, ownerId } = await callerManager(req)
  if (manager.role === 'staff') throw new Error('Only the account owner can add staff')
  const b = req.body || {}
  if (!b.email || !b.first_name || !b.last_name) throw new Error('first_name, last_name and email are required')

  const pw = tempPassword()
  const created = await admin.auth.admin.createUser({
    email: String(b.email).toLowerCase(),
    password: pw,
    email_confirm: true,
    user_metadata: { role: 'staff', first_name: b.first_name, last_name: b.last_name },
  })
  if (created.error) throw new Error(created.error.message)
  const staffId = created.data.user.id

  const base = {
    id: staffId, first_name: b.first_name, last_name: b.last_name,
    email: String(b.email).toLowerCase(), phone: b.phone ?? null,
    role: 'staff', owner_id: ownerId,
    assigned_property_ids: Array.isArray(b.assigned_property_ids) ? b.assigned_property_ids : [],
    account_status: 'active',
    // Agents don't pick a plan (the owner's plan covers the workspace), so mark
    // them onboarded up front — never send an agent to the "choose a plan" gate.
    onboarded: true,
  }
  // Must set their own password on first sign-in; starts the temp key's clock.
  const firstLoginCols = {
    first_login: true,
    temp_password_issued_at: new Date().toISOString(), temp_password_used_at: null,
  }
  let profile = await admin.from('managers').insert({ ...base, ...firstLoginCols })
  // Tolerate the first-login columns not existing yet (migration 0031 not run):
  // still create the agent, just without the forced set-password lifecycle.
  if (profile.error && /first_login|temp_password/i.test(profile.error.message)) {
    profile = await admin.from('managers').insert(base)
  }
  if (profile.error) {
    await admin.auth.admin.deleteUser(staffId)
    throw new Error(profile.error.message)
  }
  res.json({ staff_id: staffId, temp_password: pw })
}))

// POST /api/admin/staff/:id/reset-password — reset a staff member's password.
router.post('/staff/:id/reset-password', h(async (req, res) => {
  const { manager, ownerId } = await callerManager(req)
  if (manager.role === 'staff') throw new Error('Only the account owner can reset staff passwords')
  const s = ok(await req.db.from('managers').select('id, owner_id').eq('id', req.params.id).single())
  if (s.owner_id !== ownerId) throw new Error('Not your staff member')

  const pw = tempPassword()
  const upd = await admin.auth.admin.updateUserById(req.params.id, { password: pw })
  if (upd.error) throw new Error(upd.error.message)
  // Back on a manager-issued password: force them to set their own again, and
  // restart the temp key's single-use clock so the fresh one works and is unused.
  await admin.from('managers').update({
    first_login: true,
    temp_password_issued_at: new Date().toISOString(), temp_password_used_at: null,
  }).eq('id', req.params.id)
  res.json({ tempPassword: pw })
}))

export default router
