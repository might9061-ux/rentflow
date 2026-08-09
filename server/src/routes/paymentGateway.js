// Per-workspace online-payment gateway settings (Paynow / Pesepay).
//
// The owner connects their OWN merchant account so rent is paid straight to
// them. Secrets are write-only from the client's side: we accept keys here and
// store them, but GET never returns them — only whether the gateway is
// connected and switched live. All scoped to the workspace owner by RLS.
import { Router } from 'express'
import { h, ok, ownerId } from '../auth.js'

const router = Router()
const PROVIDERS = ['paynow', 'pesepay']

// Shape returned to the client — status only, never the keys themselves. The
// beneficiary email isn't a secret (it's the owner's own Pesepay email), so it's
// returned to prefill the field.
const statusOf = (row) => ({
  provider: row?.provider || null,
  live: !!row?.live,
  connected: !!(row?.integration_id && row?.integration_key),
  beneficiary_email: row?.beneficiary_email || '',
  // Split payouts are disabled (Pesepay handles fees on their side) — rent is
  // collected DIRECTLY via the owner's own keys, so there is no in-app split.
  split: false,
})

async function currentRow(req, owner) {
  // Fall back to the always-present columns if beneficiary_email hasn't been
  // added yet (migration not run), so the connect screen still works.
  let { data, error } = await req.db.from('payment_credentials')
    .select('provider, live, integration_id, integration_key, beneficiary_email')
    .eq('manager_id', owner).maybeSingle()
  if (error) {
    ({ data } = await req.db.from('payment_credentials')
      .select('provider, live, integration_id, integration_key')
      .eq('manager_id', owner).maybeSingle())
  }
  return data
}

// GET /api/payment-gateway — is a gateway connected / live? (no secrets)
router.get('/', h(async (req, res) => {
  const owner = await ownerId(req)
  res.json(statusOf(await currentRow(req, owner)))
}))

// PUT /api/payment-gateway — save/update this workspace's gateway credentials.
// Keys are only overwritten when a non-empty value is sent, so the owner can
// flip "live" on and off without re-typing their secrets.
router.put('/', h(async (req, res) => {
  const owner = await ownerId(req)
  const { provider, integration_id, integration_key, live, beneficiary_email } = req.body || {}
  if (!PROVIDERS.includes(provider)) throw new Error('Choose a supported payment provider.')

  const patch = { manager_id: owner, provider, updated_at: new Date().toISOString() }
  if (typeof integration_id === 'string' && integration_id.trim()) patch.integration_id = integration_id.trim()
  if (typeof integration_key === 'string' && integration_key.trim()) patch.integration_key = integration_key.trim()
  if (typeof live === 'boolean') patch.live = live
  // Beneficiary email (split payouts): empty string clears it, so the owner can
  // switch back to their own keys.
  if (typeof beneficiary_email === 'string') {
    const em = beneficiary_email.trim()
    if (em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) throw new Error('Enter a valid Pesepay merchant email.')
    patch.beneficiary_email = em || null
  }

  // Don't let payments go live without a way to actually collect. Split is off,
  // so that means the owner's own Pesepay integration + encryption keys — an
  // email alone can't take a payment.
  const existing = await currentRow(req, owner)
  const willHaveKeys = (patch.integration_id ?? existing?.integration_id) && (patch.integration_key ?? existing?.integration_key)
  if (patch.live === true && !willHaveKeys) {
    throw new Error('Add your Pesepay integration key and encryption key before switching payments live.')
  }

  ok(await req.db.from('payment_credentials').upsert(patch, { onConflict: 'manager_id' }))
  res.json(statusOf(await currentRow(req, owner)))
}))

// DELETE /api/payment-gateway — disconnect (removes the stored keys entirely).
router.delete('/', h(async (req, res) => {
  const owner = await ownerId(req)
  ok(await req.db.from('payment_credentials').delete().eq('manager_id', owner))
  res.json(statusOf(null))
}))

export default router
