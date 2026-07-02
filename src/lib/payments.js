// ═══════════════════════════════════════════════════════════════════════════
// Payment gateway abstraction.
//
// This is the single seam for online payments. In demo mode it SIMULATES a
// gateway so the full UX works with no credentials. For production, swap the
// bodies of chargeCard / initiateEcocash / pollEcocash to call Paynow
// (recommended for Zimbabwe — supports EcoCash express checkout, OneMoney and
// cards) or Stripe/Flutterwave, without changing any caller.
//
// Paynow flow this mirrors:
//   • EcoCash "express": POST to /interface/remotetransaction with the payer's
//     mobile number → Paynow pushes a PIN prompt to that phone → you poll the
//     pollUrl until status === 'paid'.
//   • Card: redirect/iframe to Paynow's hosted page, or tokenised charge.
// ═══════════════════════════════════════════════════════════════════════════

import { toInternational } from './phone.js'

export const PAYMENTS_PROVIDER = import.meta.env.VITE_PAYMENTS_PROVIDER || 'demo'
export const isLivePayments = PAYMENTS_PROVIDER !== 'demo'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Card helpers ────────────────────────────────────────────────────────────
export function detectBrand(number) {
  const n = (number || '').replace(/\D/g, '')
  if (/^4/.test(n)) return 'Visa'
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'Mastercard'
  if (/^3[47]/.test(n)) return 'Amex'
  if (/^6/.test(n)) return 'Discover'
  return 'Card'
}

// Luhn checksum
export function luhnValid(number) {
  const n = (number || '').replace(/\D/g, '')
  if (n.length < 12) return false
  let sum = 0, dbl = false
  for (let i = n.length - 1; i >= 0; i--) {
    let d = parseInt(n[i], 10)
    if (dbl) { d *= 2; if (d > 9) d -= 9 }
    sum += d; dbl = !dbl
  }
  return sum % 10 === 0
}

export function expiryValid(mmYY) {
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec((mmYY || '').trim())
  if (!m) return false
  const month = +m[1], year = 2000 + +m[2]
  if (month < 1 || month > 12) return false
  const end = new Date(year, month, 0, 23, 59, 59)
  return end >= new Date()
}

export function formatCardNumber(v) {
  return (v || '').replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim()
}

// ── Card charge (demo simulation) ───────────────────────────────────────────
export async function chargeCard({ number, exp, cvc, name, amount }) {
  const clean = (number || '').replace(/\D/g, '')
  if (!luhnValid(clean)) throw new Error('That card number doesn’t look right.')
  if (!expiryValid(exp)) throw new Error('Check the expiry date (MM/YY).')
  if (!/^\d{3,4}$/.test(cvc || '')) throw new Error('Enter the 3–4 digit security code.')
  if (!name?.trim()) throw new Error('Enter the name on the card.')

  // DEMO: a known "decline" test card so you can see the failure path.
  await wait(1600)
  if (clean === '4000000000000002') throw new Error('Card declined by issuer. Try another card.')

  return {
    ok: true,
    gateway: PAYMENTS_PROVIDER,
    reference: 'CARD-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    brand: detectBrand(clean),
    last4: clean.slice(-4),
  }
}

// ── EcoCash express (demo simulation) ───────────────────────────────────────
// initiate → a PIN prompt is "pushed" to the payer's phone → poll until paid.
const ecoStore = new Map()

export async function initiateEcocash({ phone, amount, reference }) {
  const intl = toInternational(phone)
  if (!intl || intl.length < 11) throw new Error('Enter a valid EcoCash number (e.g. 0772 123 456).')
  await wait(1200) // sending the merchant request
  const pollId = 'ECO-' + Math.random().toString(36).slice(2, 9).toUpperCase()
  // DEMO: auto-"authorises" ~5s after the prompt is sent, as if the user typed
  // their PIN on the handset. A number ending in 0000 simulates a decline.
  ecoStore.set(pollId, {
    phone: intl, amount, reference,
    resolveAt: Date.now() + 5000,
    decline: intl.endsWith('0000'),
  })
  return { pollId, phone: intl }
}

// Returns 'pending' | 'paid' | 'cancelled'
export async function pollEcocash(pollId) {
  const tx = ecoStore.get(pollId)
  if (!tx) return 'cancelled'
  if (Date.now() < tx.resolveAt) return 'pending'
  ecoStore.delete(pollId)
  if (tx.decline) return 'cancelled'
  return 'paid'
}

export function cancelEcocash(pollId) { ecoStore.delete(pollId) }
