// Paynow's server-to-server result callback (the "resultUrl").
//
// PUBLIC by design — Paynow posts here directly, so it sits outside /api and
// never sees a user token. That makes hash verification the ONLY thing standing
// between a forged request and rent being marked paid, so:
//   • we look the payment up by its reference (which we generated),
//   • load THAT workspace's own integration key,
//   • and let the SDK verify the hash against it.
// A callback that doesn't verify is dropped. We also ignore the amount/status
// in the body beyond the verified status, and re-check idempotently.
import { Router } from 'express'
import { admin } from '../supabase.js'
import * as paynow from '../lib/paynow.js'
import { settle } from './payments.js'

const router = Router()

router.post('/result', async (req, res) => {
  // Always 200 to Paynow — retries on our own errors would not help, and we
  // never want to leak whether a reference exists.
  try {
    const body = req.body || {}
    const reference = body.reference
    if (!reference) return res.status(200).send('ok')

    const { data: payment } = await admin
      .from('payments').select('id, manager_id, status')
      .eq('gateway_ref', reference).maybeSingle()
    if (!payment) return res.status(200).send('ok')

    // The workspace's own credentials — the hash is keyed to their integration.
    const { data: creds } = await admin
      .from('payment_credentials')
      .select('integration_id, integration_key')
      .eq('manager_id', payment.manager_id).maybeSingle()
    if (!creds?.integration_key) return res.status(200).send('ok')

    // Throws if the hash doesn't match — a forged callback stops here.
    const { state } = paynow.parseResult(body, creds)

    if (state === 'paid') await settle(payment.id)
    else if (state === 'cancelled' && payment.status === 'pending') {
      await admin.from('payments')
        .update({ status: 'rejected', rejected_reason: 'Cancelled at the payment gateway' })
        .eq('id', payment.id)
    }
    res.status(200).send('ok')
  } catch (e) {
    console.error('[paynow] result callback rejected:', e?.message || e)
    res.status(200).send('ok')
  }
})

export default router
