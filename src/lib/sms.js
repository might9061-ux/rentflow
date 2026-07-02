// ═══════════════════════════════════════════════════════════════════════════
// SMS integration.
//
// Like whatsapp.js, this opens a device deep link (the phone's SMS app,
// pre-filled). It's the single seam to upgrade to server-side SMS via Africa's
// Talking later — swap the body of sendSMS for an Edge Function call.
// ═══════════════════════════════════════════════════════════════════════════

import { toInternational } from './phone.js'

// sms:<numbers>?&body=<text> — the "?&" form is the most cross-platform
// (works on both iOS and Android). `phone` may be a single number or an array
// of numbers (comma-separated → one message to everyone at once).
export function buildSmsLink(phone, message) {
  const list = Array.isArray(phone) ? phone : [phone]
  const nums = list.map((p) => { const i = toInternational(p); return i ? '+' + i : '' }).filter(Boolean).join(',')
  return `sms:${nums}?&body=${encodeURIComponent(message)}`
}

export function sendSMS(phone, message) {
  const a = document.createElement('a')
  a.href = buildSmsLink(phone, message)
  a.target = '_blank'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
