// ═══════════════════════════════════════════════════════════════════════════
// Pesepay (Zimbabwe) — server-side gateway adapter.
//
// Same shape/interface as paynow.js so the gateway routes stay provider-agnostic
// (see gateway.js). Two callers:
//   • RENT → the LANDLORD's own keys (payment_credentials, per manager). Rent
//     lands in that landlord's Pesepay wallet.
//   • SUBSCRIPTIONS → the PLATFORM's own keys (env vars, one account). Landlords'
//     RentLoja subscription fees land in the app owner's Pesepay wallet.
//
// Mapping onto the shared credentials columns:
//   integration_id  = Pesepay INTEGRATION key  (sent as the auth header)
//   integration_key = Pesepay ENCRYPTION key   (the SDK uses it for AES-256-CBC)
//
// Flows:
//   • EcoCash (seamless) — a PIN prompt is pushed to the payer's phone; we poll
//     by reference until it reads paid.
//   • Card / other (hosted redirect) — send the payer to Pesepay's checkout page,
//     then confirm on the result webhook / on poll.
// ═══════════════════════════════════════════════════════════════════════════
import pkg from 'pesepay-js'
import { admin } from '../supabase.js'

const { PesePayClient } = pkg

const API_BASE = (process.env.PUBLIC_API_URL || '').replace(/\/$/, '')
const APP_BASE = (process.env.PUBLIC_APP_URL || 'https://www.rentloja.com').replace(/\/$/, '')

// Pesepay payment-method codes (Zimbabwe).
const MOBILE_CODES = { ecocash: 'PZW211', innbucks: 'PZW212' }

// Seamless (mobile-money) transaction statuses that mean the charge is already
// dead — Pesepay accepted the request but will NEVER push a PIN. We must fail
// fast on these instead of polling to a silent 2-minute timeout.
const SEAMLESS_DEAD = new Set([
  'FAILED', 'ERROR', 'DECLINED', 'CANCELLED', 'CLOSED', 'CLOSED_PERIOD_ELAPSED',
  'AUTHORIZATION_FAILED', 'INSUFFICIENT_FUNDS', 'SERVICE_UNAVAILABLE', 'TERMINATED', 'REVERSED',
])

export function gatewayConfigured() { return !!API_BASE }

// ── credentials ──────────────────────────────────────────────────────────────

// A landlord's own Pesepay keys (for rent). Service role: RLS would hide these
// from the tenant who is actually paying.
export async function credentialsFor(managerId) {
  const { data, error } = await admin
    .from('payment_credentials')
    .select('provider, integration_id, integration_key, live')
    .eq('manager_id', managerId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data?.integration_id || !data?.integration_key) {
    throw new Error('This landlord has not connected online payments yet. Please pay using one of the other methods.')
  }
  if (!data.live) throw new Error('Online payments are not switched on for this landlord yet.')
  return data
}

// The PLATFORM's own Pesepay keys (for subscriptions), from Render env vars so
// they never sit in the database or reach any browser.
export function platformConfigured() {
  return !!(API_BASE && process.env.PESEPAY_PLATFORM_INTEGRATION_KEY && process.env.PESEPAY_PLATFORM_ENCRYPTION_KEY)
}
export function platformCreds() {
  const integration_id = process.env.PESEPAY_PLATFORM_INTEGRATION_KEY
  const integration_key = process.env.PESEPAY_PLATFORM_ENCRYPTION_KEY
  if (!integration_id || !integration_key) {
    throw new Error('Subscription payments are not set up on the server yet (platform Pesepay keys missing).')
  }
  return { integration_id, integration_key, live: true }
}

// Pesepay runs two parallel environments on different hosts: live keys are
// recognised on the production host, sandbox/test keys only on the test host.
// The SDK hardcodes production, so we override its axios baseURL per host.
// NB the two differ by more than the host: sandbox has no "/api/" path segment.
// (per Pesepay's API docs — Production vs Sandbox endpoints.)
const PROD_BASE = 'https://api.pesepay.com/api/payments-engine/'
const TEST_BASE = 'https://api.test.sandbox.pesepay.com/payments-engine/'

function clientFor(creds, base) {
  const c = new PesePayClient(creds.integration_id, creds.integration_key)
  if (base && c.http?.defaults) c.http.defaults.baseURL = base
  return c
}

// Does this error mean "the gateway doesn't know this integration key"? That's
// what we get when live keys hit the test host or vice-versa.
function isKeyNotFound(e) {
  const s = e?.response?.status
  const body = e?.response?.data
  const msg = typeof body === 'string' ? body : (body?.message || body?.error || '')
  return s === 404 || /not\s*found/i.test(String(msg))
}

// Run a Pesepay call, trying production first and falling back to the test host
// when the key isn't recognised there — so a landlord's sandbox keys just work
// without them having to tell us which environment they're in.
async function onEitherHost(creds, fn) {
  try {
    return await fn(clientFor(creds, PROD_BASE))
  } catch (e) {
    if (!isKeyNotFound(e)) throw e
    try {
      return await fn(clientFor(creds, TEST_BASE))
    } catch (e2) {
      // Rejected on BOTH hosts → the stored integration key isn't a real Pesepay
      // key anywhere. Log a safe fingerprint (prefix + length only) so we can
      // tell whether the right value is stored, without exposing the secret.
      const id = String(creds?.integration_id || '')
      console.error(`[pesepay] integration key not found on live OR test host. id_prefix="${id.slice(0, 6)}" id_len=${id.length}`)
      throw e2
    }
  }
}

// The SDK surfaces raw axios errors ("Request failed with status code 404"),
// which tell a payer nothing. Translate the common ones into something they can
// act on — almost always a wrong integration/encryption key.
function pesepayError(e, fallback) {
  const status = e?.response?.status
  const data = e?.response?.data
  const detail = typeof data === 'string' ? data : (data?.message || data?.error || data?.reason || null)
  // Log the raw gateway response so Render logs show exactly what Pesepay said.
  try {
    const dump = typeof data === 'string' ? data : JSON.stringify(data)
    console.error(`[pesepay] gateway error status=${status} body=${(dump || '').slice(0, 400)}`)
  } catch { /* ignore logging failure */ }
  // Prefer Pesepay's own message when it gives one — it's the real reason.
  if (detail) return new Error(`Pesepay says: ${detail}`)
  if (status === 401 || status === 403) {
    return new Error('Pesepay rejected the integration key. Re-check the keys in Settings → Connect online payments (or the platform keys on the server).')
  }
  if (status === 404) {
    return new Error('Pesepay didn’t recognise this request — the integration key is wrong, or the keys are swapped, or your Pesepay account has no application/charge type set up yet.')
  }
  return new Error(e?.message || fallback)
}

// ── initiate ─────────────────────────────────────────────────────────────────

// Rent (direct): charge into the landlord's OWN account (their keys).
export async function initiate({ managerId, reference, email, amount, method, phone, description }) {
  const creds = await credentialsFor(managerId)
  return initiateWith(creds, { reference, email, amount, method, phone, description,
    resultPath: '/pesepay/result', returnPath: '/tenant/history' })
}

// Rent (split): collect on the PLATFORM's split app; Pesepay settles the rent to
// the landlord (beneficiary email) and the 0.5% service fee to the platform.
export async function initiateSplit({ reference, email, amount, method, phone, description, beneficiaryEmail }) {
  return initiateWith(platformCreds(), { reference, email, amount, method, phone, description,
    beneficiaryEmail, resultPath: '/pesepay/result', returnPath: '/tenant/history' })
}

// Subscription: charge into the platform's account.
export async function initiatePlatform({ reference, email, amount, method, phone, description }) {
  return initiateWith(platformCreds(), { reference, email, amount, method, phone, description,
    resultPath: '/pesepay-subscription/result', returnPath: '/manager/plan' })
}

async function initiateWith(creds, { reference, email, amount, method, phone, description, resultPath, returnPath, beneficiaryEmail }) {
  if (!API_BASE) throw new Error('Online payments are not configured on the server (PUBLIC_API_URL missing).')
  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Enter a valid amount.')

  const currencyCode = 'USD'
  const resultUrl = `${API_BASE}${resultPath}` // server-to-server outcome
  const returnUrl = `${APP_BASE}${returnPath}`  // where the payer lands after
  // Split: the master merchant's share (configured in Pesepay) is added ON TOP of
  // the rent — landlord (beneficiary) receives the FULL rent, platform gets the
  // fee, tenant pays rent + fee. splitAmountMode is required with a beneficiary
  // email; Pesepay's docs are ambiguous on its placement, so send it both inside
  // paymentMetadata and at the top level so ADD_ON is always honoured.
  const splitFields = beneficiaryEmail
    ? {
      paymentMetadata: { beneficiaryMerchantEmail: beneficiaryEmail, splitAmountMode: 'ADD_ON' },
      splitAmountMode: 'ADD_ON',
    }
    : {}

  const mobileCode = MOBILE_CODES[method]
  if (mobileCode) {
    if (!phone || !/^0(7[7-8])\d{7}$/.test(String(phone).replace(/\s+/g, ''))) {
      throw new Error('Enter a valid EcoCash number, e.g. 0771234567.')
    }
    let res
    try {
      res = await onEitherHost(creds, (client) => client.makeSeamlessPayment({
        amountDetails: { amount: amt, currencyCode },
        merchantReference: reference,
        reasonForPayment: description || 'Payment',
        resultUrl,
        ...splitFields,
        paymentMethodCode: mobileCode,
        customer: { phoneNumber: phone, email: email || undefined },
        paymentMethodRequiredFields: { customerPhoneNumber: phone },
      }))
    } catch (e) { throw pesepayError(e, 'The payment gateway rejected this transaction.') }

    // makeSeamlessPayment returns a Transaction that ALREADY carries a status.
    // If it's born dead, no PIN will ever be pushed — surface the real reason
    // now (and log it) instead of silently polling to a timeout.
    const st = String(res?.transactionStatus || '').toUpperCase()
    const why = res?.paymentMethodDetails?.paymentMethodMessage || res?.transactionStatusDescription || ''
    console.log(`[pesepay] seamless ${mobileCode} status=${st || 'NONE'} ref=${res?.referenceNumber || reference} msg=${String(why).slice(0, 200)}`)
    if (SEAMLESS_DEAD.has(st)) {
      // Also log which mobile methods the account actually offers for this
      // currency — the usual culprit is EcoCash not being enabled for USD.
      try {
        const methods = await onEitherHost(creds, (client) => client.getPaymentMethodsByCurrency(currencyCode))
        console.error(`[pesepay] EcoCash rejected. Active ${currencyCode} methods: ` +
          (Array.isArray(methods) ? methods.map((m) => `${m.code}(${m.name},active=${m.active})`).join(', ') : JSON.stringify(methods)))
      } catch (e2) { console.error('[pesepay] could not list active methods:', e2?.message) }
      throw new Error(
        `EcoCash couldn’t be started${why ? ` — ${why}` : ''}. ` +
        'This usually means this Pesepay account isn’t enabled for EcoCash (seamless) in ' + currencyCode +
        '. Card should still work, or contact Pesepay to enable EcoCash.')
    }
    return {
      pollUrl: res?.pollUrl || null,
      redirectUrl: null,
      reference: res?.referenceNumber || reference,
      instructions: 'Check your phone and approve the payment with your EcoCash PIN.',
    }
  }

  // Card / other → hosted redirect page (no card data touches our server).
  let res
  try {
    res = await onEitherHost(creds, (client) => client.initiateTransaction({
      amountDetails: { amount: amt, currencyCode },
      merchantReference: reference,
      reasonForPayment: description || 'Payment',
      resultUrl,
      ...splitFields,
      returnUrl,
    }))
  } catch (e) { throw pesepayError(e, 'The payment gateway rejected this transaction.') }
  return {
    pollUrl: res?.pollUrl || null,
    redirectUrl: res?.redirectUrl || null,
    reference: res?.referenceNumber || reference,
    instructions: null,
  }
}

// ── status ───────────────────────────────────────────────────────────────────

// Ask Pesepay where a transaction stands, by reference. 'paid' | 'pending' | 'cancelled'.
export async function poll({ managerId, reference }) {
  return pollWith(await credentialsFor(managerId), reference)
}
export async function pollPlatform(reference) {
  return pollWith(platformCreds(), reference)
}
async function pollWith(creds, reference) {
  try {
    const status = await onEitherHost(creds, (client) => client.checkPaymentStatus(reference))
    return normalise(status)
  } catch (e) { throw pesepayError(e, 'Could not check the payment status.') }
}

// The result webhook posts a reference; we re-check the AUTHORITATIVE status by
// reference rather than trusting the body, so a forged callback can't mark paid.
export async function parseResult(body, creds) {
  const reference = body?.referenceNumber || body?.reference || null
  if (!reference) return { state: 'pending', reference: null }
  const status = await onEitherHost(creds, (client) => client.checkPaymentStatus(reference))
  return { state: normalise(status), reference }
}
export function parseResultPlatform(body) { return parseResult(body, platformCreds()) }

function normalise(status) {
  if (status?.paid === true) return 'paid'
  const s = String(status?.transactionStatus || status?.status || '').toUpperCase()
  if (s === 'SUCCESS' || s === 'PAID') return 'paid'
  // Any terminal non-success status → cancelled, so the UI fails fast instead of
  // sitting on "pending" until it times out. (INITIATED/PENDING/PROCESSING keep
  // polling — that's the window where the payer is entering their PIN.)
  if (SEAMLESS_DEAD.has(s) || s === 'TIMEOUT') return 'cancelled'
  return 'pending'
}
