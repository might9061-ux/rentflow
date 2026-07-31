// Pesepay's server-to-server result callback for SUBSCRIPTION charges (the
// platform's own account). Public by design — Pesepay posts here directly. We
// never trust the body: we look the charge up by the reference we generated,
// re-check the authoritative status with the platform's own keys, and only then
// activate the plan. A callback we can't verify is dropped. Idempotent.
import { Router } from 'express'
import { admin } from '../supabase.js'
import * as pesepay from '../lib/pesepay.js'
import { settleSubscription } from './subscriptions.js'

const router = Router()

router.post('/result', async (req, res) => {
  try {
    const body = req.body || {}
    const reference = body.referenceNumber || body.reference
    if (!reference) return res.status(200).send('ok')

    const { data: payment } = await admin
      .from('subscription_payments').select('id, status')
      .eq('gateway_ref', reference).maybeSingle()
    if (!payment) return res.status(200).send('ok')

    const { state } = await pesepay.parseResultPlatform(body)
    if (state === 'paid') await settleSubscription(payment.id)
    else if (state === 'cancelled' && payment.status === 'pending') {
      await admin.from('subscription_payments').update({ status: 'rejected' }).eq('id', payment.id)
    }
    res.status(200).send('ok')
  } catch (e) {
    console.error('[pesepay] subscription result callback rejected:', e?.message || e)
    res.status(200).send('ok')
  }
})

export default router
