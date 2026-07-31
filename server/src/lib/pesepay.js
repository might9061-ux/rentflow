// ═══════════════════════════════════════════════════════════════════════════
// Pesepay (Zimbabwe) — server-side gateway adapter.
//
// Same shape/interface as paynow.js so the gateway routes stay provider-agnostic
// (see gateway.js). Rent goes to the LANDLORD: we build a Pesepay client from
// the paying tenant's manager's own keys, held in `payment_credentials` and read
// with the service role — never sent to the browser.
//
// Mapping onto the shared credentials columns:
//   integration_id  = Pesepay INTEGRATION key
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

export function gatewayConfigured() { return !!API_BASE }

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

function clientFor(creds) {
  return new PesePayClient(creds.integration_id, creds.integration_key)
}

// The SDK surfaces raw axios errors ("Request failed with status code 404"),
// which tell a landlord nothing. Translate the common ones into something they
// can act on — almost always a wrong integration/encryption key.
function pesepayError(e, fallback) {
  const status = e?.response?.status
  const data = e?.response?.data
  const detail = typeof data === 'string' ? data : (data?.message || data?.error || null)
  if (status === 401 || status === 403) {
    return new Error('Pesepay rejected the integration key. Re-enter your Pesepay keys in Settings → Connect online payments.')
  }
  if (status === 404) {
    return new Error('Pesepay didn’t recognise this request — usually a wrong integration key (make sure you pasted the Integration key from Pesepay, not your email). Re-enter your Pesepay keys in Settings.')
  }
  return new Error(detail ? `Pesepay: ${detail}` : (e?.message || fallback))
}

export async function initiate({ managerId, reference, email, amount, method, phone, description }) {
  if (!API_BASE) throw new Error('Online payments are not configured on the server (PUBLIC_API_URL missing).')
  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Enter a valid amount.')

  const creds = await credentialsFor(managerId)
  const client = clientFor(creds)
  const currencyCode = 'USD'
  const resultUrl = `${API_BASE}/pesepay/result` // server-to-server outcome
  const returnUrl = `${APP_BASE}/tenant/history`  // where the payer lands after

  const mobileCode = MOBILE_CODES[method]
  if (mobileCode) {
    let res
    try {
      res = await client.makeSeamlessPayment({
        amountDetails: { amount: amt, currencyCode },
        merchantReference: reference,
        reasonForPayment: description || 'Rent payment',
        resultUrl,
        paymentMethodCode: mobileCode,
        customer: { phoneNumber: phone, email: email || undefined },
        paymentMethodRequiredFields: { customerPhoneNumber: phone },
      })
    } catch (e) { throw pesepayError(e, 'The payment gateway rejected this transaction.') }
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
    res = await client.initiateTransaction({
      amountDetails: { amount: amt, currencyCode },
      merchantReference: reference,
      reasonForPayment: description || 'Rent payment',
      resultUrl,
      returnUrl,
    })
  } catch (e) { throw pesepayError(e, 'The payment gateway rejected this transaction.') }
  return {
    pollUrl: res?.pollUrl || null,
    redirectUrl: res?.redirectUrl || null,
    reference: res?.referenceNumber || reference,
    instructions: null,
  }
}

// Ask Pesepay where a transaction stands, by reference. 'paid' | 'pending' | 'cancelled'.
export async function poll({ managerId, reference }) {
  const creds = await credentialsFor(managerId)
  try {
    const status = await clientFor(creds).checkPaymentStatus(reference)
    return normalise(status)
  } catch (e) { throw pesepayError(e, 'Could not check the payment status.') }
}

// The result webhook posts a reference; we re-check the AUTHORITATIVE status by
// reference rather than trusting the body, so a forged callback can't mark paid.
export async function parseResult(body, creds) {
  const reference = body?.referenceNumber || body?.reference || null
  if (!reference) return { state: 'pending', reference: null }
  const status = await clientFor(creds).checkPaymentStatus(reference)
  return { state: normalise(status), reference }
}

function normalise(status) {
  if (status?.paid === true) return 'paid'
  const s = String(status?.transactionStatus || status?.status || '').toUpperCase()
  if (s === 'SUCCESS' || s === 'PAID') return 'paid'
  if (['CANCELLED', 'FAILED', 'CLOSED', 'ERROR', 'TIMEOUT', 'DECLINED'].includes(s)) return 'cancelled'
  return 'pending'
}
