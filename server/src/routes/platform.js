// Platform-owner (RentFlow HQ) analytics across ALL workspaces. These read the
// whole database, so they use the service-role client — but only after we've
// confirmed the caller is a platform_admin.
import { Router } from 'express'
import { admin } from '../supabase.js'
import { h, ok } from '../auth.js'

const router = Router()

const FEE_RATE = 0.005
const platformFee = (amt) => Math.round((Number(amt) || 0) * FEE_RATE * 100) / 100
const name = (m) => `${m?.first_name || ''} ${m?.last_name || ''}`.trim() || '—'

// Gate: every /api/platform route requires the caller to be a platform admin.
// We check via the caller's own scoped client (RLS-safe self-read). This is
// plain Express middleware (not wrapped in h) so `next` is forwarded correctly.
router.use(async (req, res, next) => {
  try {
    const me = ok(await req.db.from('managers').select('platform_admin').eq('id', req.user.id).single())
    if (!me?.platform_admin) return res.status(403).json({ error: 'Platform admin only' })
    next()
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
})

// PATCH /api/platform/workspaces/:id/plan — the App owner activates, changes or
// switches off a workspace's plan. This is the ONLY way a plan can be turned on:
// managers can no longer set their own billing columns (migration 0019), so a
// landlord pays out-of-band (EcoCash/bank) and the owner flips them on here.
// Uses the service-role client, which the trigger in 0019 trusts.
router.patch('/workspaces/:id/plan', h(async (req, res) => {
  const { plan_active, plan_capacity, plan_price } = req.body || {}
  const patch = {}

  if (plan_active !== undefined) patch.plan_active = !!plan_active
  if (plan_capacity !== undefined) {
    const c = Number(plan_capacity)
    if (!Number.isFinite(c) || c < 0) throw new Error('Capacity must be a positive number.')
    patch.plan_capacity = Math.floor(c)
  }
  if (plan_price !== undefined) {
    const p = Number(plan_price)
    if (!Number.isFinite(p) || p < 0) throw new Error('Price must be a positive number.')
    patch.plan_price = p
  }
  if (!Object.keys(patch).length) throw new Error('Nothing to update.')

  // Stamp the start date the first time a workspace is switched on.
  if (patch.plan_active) {
    const { data: cur } = await admin.from('managers').select('plan_started_at').eq('id', req.params.id).maybeSingle()
    if (!cur?.plan_started_at) patch.plan_started_at = new Date().toISOString()
  }

  res.json(ok(await admin.from('managers').update(patch).eq('id', req.params.id).select(
    'id, first_name, last_name, brand_name, plan_active, plan_capacity, plan_price, plan_started_at',
  ).single()))
}))

// POST /api/platform/workspaces/:id/payment — record money actually received
// from a landlord (EcoCash, bank, cash…). Activating a plan only grants access;
// this is what puts it in "Subs paid", the revenue totals and their receipt
// history. Kept separate so monthly renewals don't need the plan changing.
router.post('/workspaces/:id/payment', h(async (req, res) => {
  const { amount, method, reference, period } = req.body || {}
  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Enter a valid amount.')

  const monthLabel = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  res.json(ok(await admin.from('subscription_payments').insert({
    manager_id: req.params.id,
    amount: amt,
    period: period || monthLabel,
    method: method || 'Manual',
    reference: reference || null,
  }).select().single()))
}))

router.get('/overview', h(async (req, res) => {
  const [owners, agents, subs, tenants, approved] = await Promise.all([
    ok(await admin.from('managers').select('id,first_name,last_name,brand_name,email,country,plan_active,plan_capacity,plan_price,created_at').eq('role', 'owner').neq('platform_admin', true)),
    ok(await admin.from('managers').select('id,owner_id').eq('role', 'staff')),
    ok(await admin.from('subscription_payments').select('*').order('created_at', { ascending: false })),
    ok(await admin.from('tenants').select('manager_id')),
    ok(await admin.from('payments').select('manager_id,amount,fee,approved_at,paid_date,created_at').eq('status', 'approved')),
  ])
  const workspaces = owners.map((m) => {
    const ws = subs.filter((s) => s.manager_id === m.id)
    const volume = approved.filter((p) => p.manager_id === m.id).reduce((s, p) => s + Number(p.amount), 0)
    return { id: m.id, name: name(m), company: m.brand_name || name(m), email: m.email, country: m.country || 'ZW',
      plan_active: !!m.plan_active, plan_capacity: Number(m.plan_capacity) || 0, plan_price: Number(m.plan_price) || 0,
      tenants: tenants.filter((t) => t.manager_id === m.id).length,
      agents: agents.filter((a) => a.owner_id === m.id).length,
      total_paid: ws.reduce((s, x) => s + Number(x.amount), 0), payments: ws.length,
      rent_volume: volume, fees: platformFee(volume),
      last_payment_at: ws[0]?.created_at || null, joined_at: m.created_at }
  }).sort((a, b) => b.total_paid - a.total_paid)
  const subscriptionRevenue = subs.reduce((s, x) => s + Number(x.amount), 0)
  const transactionVolume = approved.reduce((s, p) => s + Number(p.amount), 0)
  res.json({
    subscriptionRevenue, transactionVolume, transactionFees: platformFee(transactionVolume),
    totalRevenue: subscriptionRevenue + platformFee(transactionVolume),
    mrr: owners.filter((o) => o.plan_active).reduce((s, o) => s + (Number(o.plan_price) || 0), 0),
    activeSubs: owners.filter((o) => o.plan_active).length, totalWorkspaces: owners.length,
    users: { tenants: tenants.length, managers: owners.length, agents: agents.length },
    subscriptions: subs.map((s) => ({ created_at: s.created_at, amount: Number(s.amount), manager_id: s.manager_id })),
    // The overview's "Recent subscription payments" table — needs the workspace
    // name and what the payment was for, which the bare subscriptions list above
    // (used only for revenue sums) doesn't carry.
    recentPayments: subs.slice(0, 20).map((s) => {
      const o = owners.find((m) => m.id === s.manager_id)
      return {
        id: s.id,
        created_at: s.created_at,
        amount: Number(s.amount),
        workspace: o ? (o.brand_name || name(o)) : '—',
        period: s.period || '—',
        method: s.method || '—',
      }
    }),
    transactions: approved.map((p) => ({ created_at: p.approved_at || p.paid_date || p.created_at, amount: Number(p.amount), fee: p.fee != null ? Number(p.fee) : platformFee(p.amount), manager_id: p.manager_id })),
    workspaces,
  })
}))

router.get('/users', h(async (_req, res) => {
  const [owners, agents, tenants] = await Promise.all([
    ok(await admin.from('managers').select('id,first_name,last_name,brand_name').eq('role', 'owner').neq('platform_admin', true)),
    ok(await admin.from('managers').select('id,owner_id').eq('role', 'staff')),
    ok(await admin.from('tenants').select('manager_id')),
  ])
  const perCompany = owners.map((o) => ({ id: o.id, company: o.brand_name || name(o), manager: name(o),
    agents: agents.filter((a) => a.owner_id === o.id).length, tenants: tenants.filter((t) => t.manager_id === o.id).length }))
    .sort((a, b) => (b.tenants + b.agents) - (a.tenants + a.agents))
  res.json({ totals: { tenants: tenants.length, managers: owners.length, agents: agents.length },
    total: tenants.length + owners.length + agents.length, perCompany })
}))

router.get('/subscriptions', h(async (_req, res) => {
  const [owners, subs] = await Promise.all([
    ok(await admin.from('managers').select('id,first_name,last_name,brand_name,plan_active,plan_price').eq('role', 'owner').neq('platform_admin', true)),
    ok(await admin.from('subscription_payments').select('*').order('created_at', { ascending: false })),
  ])
  const payments = subs.map((p) => { const o = owners.find((x) => x.id === p.manager_id); return { ...p, workspace: name(o), company: o?.brand_name || name(o) } })
  res.json({ total: subs.reduce((s, x) => s + Number(x.amount), 0), count: subs.length,
    mrr: owners.filter((o) => o.plan_active).reduce((s, o) => s + (Number(o.plan_price) || 0), 0), payments })
}))

router.get('/transactions', h(async (_req, res) => {
  const [owners, tenants, approved] = await Promise.all([
    ok(await admin.from('managers').select('id,first_name,last_name,brand_name').eq('role', 'owner').neq('platform_admin', true)),
    ok(await admin.from('tenants').select('id,first_name,last_name')),
    ok(await admin.from('payments').select('id,manager_id,tenant_id,amount,fee,method,approved_at,paid_date,created_at').eq('status', 'approved').order('created_at', { ascending: false })),
  ])
  const company = (o) => o?.brand_name || name(o)
  const payments = approved.map((p) => { const o = owners.find((x) => x.id === p.manager_id); return { id: p.id, manager_id: p.manager_id, created_at: p.approved_at || p.paid_date || p.created_at,
    amount: Number(p.amount), fee: p.fee != null ? Number(p.fee) : platformFee(p.amount), method: p.method,
    workspace: company(o), manager: name(o), tenant: name(tenants.find((t) => t.id === p.tenant_id)) } })
  const byWorkspace = owners.map((m) => {
    const ws = approved.filter((p) => p.manager_id === m.id)
    const volume = ws.reduce((s, p) => s + Number(p.amount), 0)
    return { id: m.id, name: company(m), manager: name(m), volume, fees: platformFee(volume), count: ws.length }
  }).filter((w) => w.count > 0).sort((a, b) => b.fees - a.fees)
  res.json({ totalVolume: payments.reduce((s, r) => s + r.amount, 0), totalFees: payments.reduce((s, r) => s + r.fee, 0),
    count: payments.length, byWorkspace, payments })
}))

export default router
