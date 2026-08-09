// Tenant reads/updates. Creating a tenant (which needs an auth account) lives
// in routes/admin.js — this file covers listing, fetching and editing.
import { Router } from 'express'
import { admin } from '../supabase.js'
import { h, ok } from '../auth.js'
import * as pesepay from '../lib/pesepay.js'

const router = Router()

router.get('/', h(async (req, res) => {
  res.json(ok(await req.db.from('tenants').select('*').order('created_at')))
}))

// GET /api/tenants/me/manager — the caller's (tenant's) manager profile, for
// branding + currency in the tenant portal. Fetched with the service-role
// client but strictly scoped to the tenant's own manager_id.
router.get('/me/manager', h(async (req, res) => {
  const me = ok(await req.db.from('tenants').select('manager_id').eq('id', req.user.id).single())
  const manager = ok(await admin.from('managers').select('*').eq('id', me.manager_id).single())
  // Whether this landlord's online gateway is connected AND switched live — a
  // plain boolean so the tenant portal can offer a real online payment. The
  // keys themselves are never exposed to the tenant.
  let { data: creds } = await admin.from('payment_credentials')
    .select('provider, live, integration_id, integration_key, beneficiary_email').eq('manager_id', me.manager_id).maybeSingle()
  // Resilience: if beneficiary_email hasn't been added yet (migration not run),
  // that select errors and returns null — which must NOT silently disable live
  // payments. Fall back to the columns that always exist so the keys path still
  // works and tenants keep seeing the real gateway.
  if (!creds) {
    ({ data: creds } = await admin.from('payment_credentials')
      .select('provider, live, integration_id, integration_key').eq('manager_id', me.manager_id).maybeSingle())
  }
  // Split is OFF (Pesepay handles fees on their side), so rent is collected
  // DIRECTLY into the landlord's own Pesepay account — which needs their own
  // integration + encryption keys. A beneficiary email alone can't take a
  // payment, so it must NOT count as "live" (that showed tenants a "Pay online"
  // button that then failed to start).
  const canCollect = !!(creds?.integration_id && creds?.integration_key)
  res.json({
    ...manager,
    online_payments_live: !!(creds?.live && canCollect),
    online_payments_provider: creds?.provider || null,
  })
}))

// POST /api/tenants/me/delete — a tenant permanently deletes their own account.
// Password-verified. Removes the tenancy record (payments cascade off it) and
// the auth login.
router.post('/me/delete', h(async (_req, res) => {
  // Tenants cannot delete their own account — only their manager manages it.
  res.status(403).json({ error: 'Tenants can’t delete their own account. Please contact your manager.' })
}))

router.get('/:id', h(async (req, res) => {
  res.json(ok(await req.db.from('tenants').select('*').eq('id', req.params.id).single()))
}))

router.patch('/:id', h(async (req, res) => {
  const body = { ...(req.body || {}) }
  // Ownership check via the RLS-scoped client — throws if this isn't the caller's
  // tenant, which also gates the service-role auth update below.
  ok(await req.db.from('tenants').select('id').eq('id', req.params.id).single())

  // Keep the LOGIN email in sync with the record. Editing a tenant's email used
  // to change only the tenants row, leaving their Supabase Auth login on the old
  // address — so they could no longer sign in. Push it to Auth too. Idempotent,
  // so simply re-saving a tenant also repairs one that was already broken.
  if (body.email) {
    const email = String(body.email).trim().toLowerCase()
    body.email = email
    const upd = await admin.auth.admin.updateUserById(req.params.id, { email, email_confirm: true })
    if (upd.error) throw new Error(`Could not update the login email: ${upd.error.message}`)
  }

  res.json(ok(await req.db.from('tenants').update(body).eq('id', req.params.id).select().single()))
}))

router.delete('/:id', h(async (req, res) => {
  // Soft-delete: keep the payment history for the manager's records (payments
  // cascade off the tenant row, so a hard delete would erase them). Mark
  // deleted_at, free the unit and remove the login; the row stays as the anchor.
  ok(await req.db.from('tenants').update({
    deleted_at: new Date().toISOString(), account_status: 'suspended', property_id: null, unit: '',
  }).eq('id', req.params.id))
  try { await admin.auth.admin.deleteUser(req.params.id) } catch { /* no auth user */ }
  res.json({ deleted: true })
}))

export default router
