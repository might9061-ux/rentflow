// Payments: tenants submit (pending), managers approve/reject or log directly.
// Approve/reject run through SECURITY DEFINER RPCs so credit/receipt logic and
// authorisation happen in the database.
import { Router } from 'express'
import { h, ok, ownerId } from '../auth.js'
import { admin } from '../supabase.js'
import { adapterFor } from '../lib/gateway.js'

const router = Router()

// GET /api/payments?status=pending — payments in the caller's workspace.
router.get('/', h(async (req, res) => {
  let q = req.db.from('payments').select('*').order('created_at', { ascending: false })
  if (req.query.status) q = q.eq('status', req.query.status)
  res.json(ok(await q))
}))

// GET /api/payments/tenant/:tenantId — one tenant's payment history.
router.get('/tenant/:tenantId', h(async (req, res) => {
  res.json(ok(await req.db.from('payments').select('*')
    .eq('tenant_id', req.params.tenantId).order('created_at', { ascending: false })))
}))

// POST /api/payments — a tenant submits a (pending) payment for themselves.
// manager_id is resolved from the tenant's own row so it can't be spoofed.
router.post('/', h(async (req, res) => {
  const t = ok(await req.db.from('tenants').select('manager_id').eq('id', req.user.id).single())
  const row = { ...req.body, tenant_id: req.user.id, manager_id: t.manager_id, status: 'pending' }
  res.json(ok(await req.db.from('payments').insert(row).select().single()))
}))

// POST /api/payments/online — a tenant submits an online (gateway) payment.
// Stays pending until the gateway webhook confirms it server-side.
router.post('/online', h(async (req, res) => {
  const t = ok(await req.db.from('tenants').select('manager_id').eq('id', req.user.id).single())
  const row = { ...req.body, tenant_id: req.user.id, manager_id: t.manager_id, paid_online: true, status: 'pending' }
  res.json(ok(await req.db.from('payments').insert(row).select().single()))
}))

// POST /api/payments/gateway/start — a tenant starts a REAL gateway payment.
//
// The money goes to the landlord's own Paynow account. We create the payment
// row as pending and hand back what the tenant's device needs (a PIN prompt is
// pushed to their phone for EcoCash, or a checkout URL for card). It only
// becomes 'approved' when the gateway itself confirms it — never on the
// client's say-so.
router.post('/gateway/start', h(async (req, res) => {
  const t = ok(await req.db.from('tenants')
    .select('manager_id, first_name, last_name, email').eq('id', req.user.id).single())
  const { amount, fee, method, phone, period_from, period_to } = req.body || {}

  // The tenant is charged rent + the platform fee; the record keeps them apart
  // (amount = rent, fee = platform fee) so receipts and finances read correctly.
  const rent = Number(amount) || 0
  const feeAmt = Number(fee) || 0
  const charge = rent + feeAmt

  const reference = `RENT-${Date.now().toString(36).toUpperCase()}`
  const gw = await adapterFor(t.manager_id)
  const started = await gw.initiate({
    managerId: t.manager_id,
    reference,
    email: t.email || req.user.email,
    amount: charge,
    method,
    phone,
    description: `Rent — ${[t.first_name, t.last_name].filter(Boolean).join(' ')}`,
  })

  const row = ok(await req.db.from('payments').insert({
    tenant_id: req.user.id, manager_id: t.manager_id,
    amount: rent, fee: feeAmt, method: method || 'card', payer_phone: phone || null,
    period_from, period_to,
    // Set the same fields a manual/online payment does, so the receipt and the
    // date-based finance views treat it like any other payment.
    paid_date: new Date().toISOString().slice(0, 10),
    reference: started.reference || reference,
    paid_online: true, status: 'pending',
    // Pesepay returns its own reference; fall back to ours (Paynow uses ours).
    gateway_ref: started.reference || reference, gateway_poll_url: started.pollUrl,
  }).select().single())

  res.json({
    payment: row,
    redirectUrl: started.redirectUrl,
    instructions: started.instructions,
  })
}))

// GET /api/payments/gateway/status/:id — has the gateway confirmed it yet?
// Approving here (rather than trusting the client) is what makes this safe:
// the tenant's device can only ASK, the gateway decides.
router.get('/gateway/status/:id', h(async (req, res) => {
  const p = ok(await req.db.from('payments')
    .select('id, manager_id, status, gateway_poll_url, gateway_ref').eq('id', req.params.id).single())

  if (p.status === 'approved') return res.json({ state: 'paid', payment: p })
  // Paynow polls a pollUrl; Pesepay polls by reference. Need one of them.
  if (!p.gateway_poll_url && !p.gateway_ref) return res.json({ state: 'pending', payment: p })

  const gw = await adapterFor(p.manager_id)
  const state = await gw.poll({ managerId: p.manager_id, pollUrl: p.gateway_poll_url, reference: p.gateway_ref })
  if (state === 'paid') await settle(p.id)
  if (state === 'cancelled') {
    await admin.from('payments').update({ status: 'rejected', rejected_reason: 'Cancelled at the payment gateway' }).eq('id', p.id)
  }
  const fresh = ok(await req.db.from('payments').select('*').eq('id', p.id).single())
  res.json({ state, payment: fresh })
}))

// Mark a gateway-confirmed payment approved, via the same RPC the manager's
// approve button uses — so receipts, credit and the ledger stay identical.
// Idempotent: 0016 made approve_payment safe to call twice.
async function settle(paymentId) {
  const { data: row } = await admin.from('payments').select('status').eq('id', paymentId).maybeSingle()
  if (!row || row.status === 'approved') return
  const { error } = await admin.rpc('approve_payment', { p_payment_id: paymentId })
  if (error) throw new Error(error.message)
}
export { settle }

// POST /api/payments/log — a manager records a payment (e.g. cash) then approves
// it so a receipt is issued immediately.
router.post('/log', h(async (req, res) => {
  const manager_id = await ownerId(req)
  const b = req.body || {}
  const inserted = ok(await req.db.from('payments').insert({
    ...b, manager_id, status: 'pending', recorded_by: 'manager',
  }).select().single())
  ok(await req.db.rpc('approve_payment', { p_payment_id: inserted.id }))
  res.json(ok(await req.db.from('payments').select('*').eq('id', inserted.id).single()))
}))

// POST /api/payments/:id/approve
router.post('/:id/approve', h(async (req, res) => {
  const p = ok(await req.db.from('payments')
    .select('id, manager_id, status, paid_online, gateway_ref, gateway_poll_url').eq('id', req.params.id).single())

  // Online payments are confirmed by the gateway, never on the manager's word.
  // Re-check with the provider and approve only if it actually reads paid — so a
  // cancelled/abandoned attempt can't be marked paid by clicking Approve.
  if (p.status !== 'approved' && p.paid_online) {
    if (!p.gateway_ref && !p.gateway_poll_url) {
      throw new Error('This is an online payment awaiting the gateway — it’s marked paid automatically once the gateway confirms it, not by hand.')
    }
    const gw = await adapterFor(p.manager_id)
    const state = await gw.poll({ managerId: p.manager_id, pollUrl: p.gateway_poll_url, reference: p.gateway_ref })
    if (state !== 'paid') {
      throw new Error('The payment gateway hasn’t confirmed this payment, so it can’t be approved. It updates automatically once the gateway confirms it.')
    }
    await settle(p.id)
    return res.json(ok(await req.db.from('payments').select('*').eq('id', req.params.id).single()))
  }

  ok(await req.db.rpc('approve_payment', { p_payment_id: req.params.id }))
  res.json(ok(await req.db.from('payments').select('*').eq('id', req.params.id).single()))
}))

// POST /api/payments/:id/reject
router.post('/:id/reject', h(async (req, res) => {
  ok(await req.db.rpc('reject_payment', { p_payment_id: req.params.id, p_reason: req.body?.reason || null }))
  res.json({ rejected: true })
}))

export default router
