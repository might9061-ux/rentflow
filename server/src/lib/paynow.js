// ═══════════════════════════════════════════════════════════════════════════
// Paynow (Zimbabwe) — server-side gateway integration.
//
// Rent goes STRAIGHT TO THE LANDLORD: we build a Paynow client from the
// paying tenant's manager's own credentials, so RentLoja never holds tenant
// money. Credentials live in `payment_credentials` and are read with the
// service role — they are never sent to the browser.
//
// Uses the official `paynow` SDK so the SHA512 hashing and hash verification
// are theirs, not hand-rolled.
//
// Flows:
//   • EcoCash express (sendMobile) — a PIN prompt is pushed to the payer's
//     phone; we poll the returned pollUrl until it reads paid.
//   • Card / other (send) — returns a hosted redirectUrl to send the payer to.
// ═══════════════════════════════════════════════════════════════════════════
import PaynowPkg from 'paynow'
import { admin } from '../supabase.js'

const Paynow = PaynowPkg.Paynow || PaynowPkg

// Where Paynow tells us the outcome (server-to-server) and where the payer
// lands afterwards. Both must be publicly reachable.
const API_BASE = (process.env.PUBLIC_API_URL || '').replace(/\/$/, '')
const APP_BASE = (process.env.PUBLIC_APP_URL || 'https://www.rentloja.com').replace(/\/$/, '')

export function gatewayConfigured() { return !!API_BASE }

// The workspace's own Paynow credentials. Service role: RLS would hide these
// from the tenant who is actually making the payment.
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
  if (!data.live) {
    throw new Error('Online payments are not switched on for this landlord yet.')
  }
  return data
}

function clientFor(creds) {
  return new Paynow(
    creds.integration_id,
    creds.integration_key,
    `${API_BASE}/paynow/result`, // resultUrl — Paynow POSTs the outcome here
    `${APP_BASE}/tenant/history`, // returnUrl — where the payer lands after paying
  )
}

// Start a payment. `method` 'ecocash' | 'onemoney' pushes a prompt to `phone`;
// anything else returns a hosted checkout URL to redirect the payer to.
// Returns { pollUrl, redirectUrl, instructions, reference }.
export async function initiate({ managerId, reference, email, amount, method, phone, description }) {
  if (!API_BASE) throw new Error('Online payments are not configured on the server (PUBLIC_API_URL missing).')
  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Enter a valid amount.')

  const creds = await credentialsFor(managerId)
  const paynow = clientFor(creds)

  // authEmail is required by Paynow for express (mobile) transactions.
  const payment = paynow.createPayment(reference, email || 'payments@rentloja.com')
  payment.add(description || 'Rent payment', amt)

  const mobile = method === 'ecocash' || method === 'onemoney'
  const res = mobile
    ? await paynow.sendMobile(payment, phone, method)
    : await paynow.send(payment)

  if (!res?.success) throw new Error(res?.error || 'The payment gateway rejected this transaction.')

  return {
    pollUrl: res.pollUrl || null,
    redirectUrl: res.redirectUrl || null,
    instructions: res.instructions || null,
    reference,
  }
}

// Ask Paynow where a transaction stands. Returns 'paid' | 'pending' | 'cancelled'.
export async function poll({ managerId, pollUrl }) {
  const creds = await credentialsFor(managerId)
  const paynow = clientFor(creds)
  const status = await paynow.pollTransaction(pollUrl)
  return normalise(status?.status, status)
}

// Verify + parse an inbound Paynow status update (the resultUrl webhook).
// Throws if the hash doesn't match, so a forged callback can't mark rent paid.
export function parseResult(body, creds) {
  const paynow = clientFor(creds)
  const status = paynow.parseStatusUpdate(new URLSearchParams(body).toString())
  return { state: normalise(status?.status, status), reference: status?.reference, amount: status?.amount }
}

function normalise(raw, status) {
  if (typeof status?.paid === 'function' && status.paid()) return 'paid'
  const s = String(raw || '').toLowerCase()
  if (s === 'paid' || s === 'awaiting delivery' || s === 'delivered') return 'paid'
  if (s === 'cancelled' || s === 'failed' || s === 'disputed' || s === 'refunded') return 'cancelled'
  return 'pending'
}
