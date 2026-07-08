// ═══════════════════════════════════════════════════════════════════════════
// WhatsApp integration.
//
// For now this builds wa.me deep links and opens them. The send() function is
// the single seam to upgrade later to the WhatsApp Business (Cloud) API — swap
// the body of sendViaDeepLink for an API call without touching callers.
// ═══════════════════════════════════════════════════════════════════════════

import { toInternational } from './phone.js'

// Build a wa.me URL. https://wa.me/<intlphone>?text=<encoded message>
export function buildWaLink(phone, message) {
  const intl = toInternational(phone)
  const text = encodeURIComponent(message)
  return intl ? `https://wa.me/${intl}?text=${text}` : `https://wa.me/?text=${text}`
}

// The single integration seam. Today: open the deep link in a new tab.
// Tomorrow: POST to the WhatsApp Business Cloud API from an Edge Function.
export function sendWhatsApp(phone, message) {
  const url = buildWaLink(phone, message)
  window.open(url, '_blank', 'noopener')
  return url
}

// Send the same message to many tenants. Deep links are one-to-one, so this
// opens each chat in sequence (allow pop-ups). For fully-automatic bulk send,
// upgrade sendWhatsApp to the WhatsApp Business Cloud API.
export function sendWhatsAppBulk(phones, message, gap = 700) {
  const list = (Array.isArray(phones) ? phones : [phones]).filter(Boolean)
  list.forEach((p, i) => setTimeout(() => sendWhatsApp(p, message), i * gap))
  return list.length
}

// ── Message templates ───────────────────────────────────────────────────────
export function credentialsMessage({ tenant, manager, tempPassword, appUrl }) {
  const name = tenant.first_name || 'there'
  return (
`Hello ${name}, welcome to RentPilot 🏠

Your tenant account for ${manager?.first_name ? manager.first_name + "'s" : 'your'} property has been created.

Sign in here: ${appUrl || window.location.origin}

📧 Email: ${tenant.email}
🔑 Temporary password: ${tempPassword}

On your first login you'll verify your email/phone with a 6-digit code, then set your own permanent password.

Rent: $${Number(tenant.rent || 0).toFixed(2)} / month
Unit: ${tenant.unit || '—'}`
  )
}

// "To let" advert for an advertised property.
export function listingMessage(p, manager) {
  const lines = [`🏠 *FOR RENT — ${p.name}*`]
  const loc = [p.suburb, p.city].filter(Boolean).join(', ') || p.location
  if (loc) lines.push(`📍 ${loc}`)
  const specs = []
  if (p.bedrooms != null) specs.push(`${p.bedrooms} bed`)
  if (p.bathrooms != null) specs.push(`${p.bathrooms} bath`)
  if (p.furnished) specs.push(p.furnished.toLowerCase())
  if (specs.length) lines.push(`🛏️ ${specs.join(' · ')}`)
  if (p.type) lines.push(`🏢 ${p.type}`)
  if (p.deposit != null) lines.push(`💵 Deposit: $${Number(p.deposit).toFixed(2)}`)
  if (p.available_from) lines.push(`📅 Available from ${new Date(p.available_from).toLocaleDateString()}`)
  if (p.description) lines.push(`\n${p.description}`)
  if (p.map_link) lines.push(`\n📌 ${p.map_link}`)
  const contact = manager?.phone || p.caretaker_phone
  if (contact) lines.push(`\n📞 Enquiries: ${contact}`)
  lines.push(`\n— via RentPilot`)
  return lines.join('\n')
}

export function notificationMessage({ subject, message, manager, priority }) {
  const tag = priority === 'urgent' ? '🔴 URGENT — ' : priority === 'info' ? 'ℹ️ ' : '📢 '
  return `${tag}${subject}\n\n${message}\n\n— ${manager?.first_name || 'Your manager'} (via RentPilot)`
}

export function receiptMessage({ tenant, payment, manager, periodLabel }) {
  return (
`RENT RECEIPT — RentPilot ✅

Receipt No: ${payment.receipt_no}
Tenant: ${tenant.first_name} ${tenant.last_name}
Unit: ${tenant.unit || '—'}
Billing period: ${periodLabel}

Amount: $${Number(payment.amount).toFixed(2)}
Method: ${payment.method}
Reference: ${payment.reference || '—'}
Date: ${new Date(payment.paid_date).toLocaleDateString()}
${payment.credit_amount > 0 ? `Credit carried forward: $${Number(payment.credit_amount).toFixed(2)}\n` : ''}
Approved by ${manager?.first_name || 'Manager'} ${manager?.last_name || ''}
Thank you for your payment. — RentPilot`
  )
}
