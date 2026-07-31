// Pesepay's server-to-server result callback (the "resultUrl").
//
// PUBLIC by design — Pesepay posts here directly, outside /api with no token. So
// we never trust the body: we look the payment up by the reference WE generated,
// load THAT workspace's own keys, and re-query Pesepay for the authoritative
// status. A callback we can't verify against Pesepay is dropped. Idempotent.
import { Router } from 'express'
import { admin } from '../supabase.js'
import * as pesepay from '../lib/pesepay.js'
import { settle } from './payments.js'

const router = Router()

router.post('/result', async (req, res) => {
  try {
    const body = req.body || {}
    const reference = body.referenceNumber || body.reference
    if (!reference) return res.status(200).send('ok')

    const { data: payment } = await admin
      .from('payments').select('id, manager_id, status')
      .eq('gateway_ref', reference).maybeSingle()
    if (!payment) return res.status(200).send('ok')

    const { data: creds } = await admin
      .from('payment_credentials')
      .select('provider, integration_id, integration_key')
      .eq('manager_id', payment.manager_id).maybeSingle()
    if (!creds?.integration_key) return res.status(200).send('ok')

    const { state } = await pesepay.parseResult(body, creds)
    if (state === 'paid') await settle(payment.id)
    else if (state === 'cancelled' && payment.status === 'pending') {
      await admin.from('payments')
        .update({ status: 'rejected', rejected_reason: 'Cancelled at the payment gateway' })
        .eq('id', payment.id)
    }
    res.status(200).send('ok')
  } catch (e) {
    console.error('[pesepay] result callback rejected:', e?.message || e)
    res.status(200).send('ok')
  }
})

export default router
