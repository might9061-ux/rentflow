// The manager's own plan/installment payments (their subscription to RentLoja).
// The plain routes below record a payment; the /gateway/* routes take a REAL
// Pesepay charge into the PLATFORM's account and, once confirmed, activate the
// plan — so a landlord can only get access after money actually arrives.
import { Router } from 'express'
import { h, ok, ownerId } from '../auth.js'
import { admin } from '../supabase.js'
import { tierFor, activatePaidPlan } from '../lib/plan.js'
import * as pesepay from '../lib/pesepay.js'

const router = Router()

const monthYear = () => new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })

router.get('/', h(async (req, res) => {
  const manager_id = await ownerId(req)
  res.json(ok(await req.db.from('subscription_payments').select('*').eq('manager_id', manager_id).order('created_at', { ascending: false })))
}))

router.post('/', h(async (req, res) => {
  const manager_id = await ownerId(req)
  res.json(ok(await req.db.from('subscription_payments').insert({ manager_id, ...req.body }).select().single()))
}))

// POST /api/subscriptions/gateway/start — pay the subscription into the
// PLATFORM's Pesepay account. Returns a checkout URL (card) or pushes a PIN
// prompt (EcoCash). The plan only activates once the charge is confirmed.
router.post('/gateway/start', h(async (req, res) => {
  if (!pesepay.platformConfigured()) throw new Error('Subscription payments aren’t set up yet. Please contact support.')
  const owner = await ownerId(req)
  const capacity = Math.floor(Number(req.body?.capacity) || 0)
  if (!Number.isFinite(capacity) || capacity < 1) throw new Error('Choose how many tenants you need.')
  if (capacity > 500) throw new Error('That capacity is too large — please contact support.')

  // Never let a workspace pay for fewer tenants than it already has.
  const { count } = await admin.from('tenants').select('id', { count: 'exact', head: true }).eq('manager_id', owner)
  if (capacity < (count || 0)) throw new Error(`You already have ${count} tenants — choose at least that many.`)

  const { method, phone } = req.body || {}
  const cycle = req.body?.cycle === 'yearly' ? 'yearly' : 'monthly'
  const tier = tierFor(capacity)
  const amount = cycle === 'yearly' ? tier.price * 12 : tier.price

  const reference = `SUB-${Date.now().toString(36).toUpperCase()}`
  const m = ok(await admin.from('managers').select('email, first_name, last_name').eq('id', owner).single())
  const started = await pesepay.initiatePlatform({
    reference, email: m.email, amount, method, phone,
    description: `RentLoja ${tier.name} plan (${cycle}) — up to ${capacity} tenants`,
  })

  const row = ok(await admin.from('subscription_payments').insert({
    manager_id: owner, amount, capacity, plan_cycle: cycle, period: monthYear(),
    method: method || 'card', status: 'pending',
    gateway_ref: started.reference || reference, gateway_poll_url: started.pollUrl,
  }).select().single())

  res.json({ payment: row, redirectUrl: started.redirectUrl, instructions: started.instructions })
}))

// GET /api/subscriptions/gateway/status/:id — has the charge confirmed yet?
// Activating the plan here (not on the client's word) is what keeps it honest.
router.get('/gateway/status/:id', h(async (req, res) => {
  const owner = await ownerId(req)
  const p = ok(await admin.from('subscription_payments').select('*')
    .eq('id', req.params.id).eq('manager_id', owner).single())

  if (p.status === 'approved') return res.json({ state: 'paid', payment: p })
  if (!p.gateway_poll_url && !p.gateway_ref) return res.json({ state: 'pending', payment: p })

  const state = await pesepay.pollPlatform(p.gateway_ref)
  if (state === 'paid') await settleSubscription(p.id)
  if (state === 'cancelled') {
    await admin.from('subscription_payments').update({ status: 'rejected' }).eq('id', p.id)
  }
  const fresh = ok(await admin.from('subscription_payments').select('*').eq('id', p.id).single())
  res.json({ state, payment: fresh })
}))

// Confirm a subscription charge: mark it approved and activate the plan. Called
// from the status poll and the result webhook. Idempotent.
export async function settleSubscription(id) {
  const { data: row } = await admin.from('subscription_payments').select('*').eq('id', id).maybeSingle()
  if (!row || row.status === 'approved') return
  await admin.from('subscription_payments').update({ status: 'approved' }).eq('id', id)
  await activatePaidPlan(row.manager_id, Number(row.capacity) || 1, row.plan_cycle)
}

export default router
