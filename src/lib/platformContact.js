// How anyone reaches RentLoja HQ — landlords activating a plan, and any
// individual (tenant or visitor) who needs help. Surfaced on the login screens
// and the public listings footer, and shown to the App owner in Admin settings.
//
// Plans are activated by the App owner from the admin console after payment
// lands (managers can't switch themselves on — see migration 0019), so the
// signup flow needs to tell people exactly how to reach you.
//
// Set these in the frontend environment (Vercel) to change them without a code
// edit — the env value OVERRIDES the default below, so update Vercel too if you
// change the number/email here:
//   VITE_BILLING_EMAIL     — where help & activation requests should go
//   VITE_BILLING_WHATSAPP  — international digits, e.g. 263772000111
//   VITE_BILLING_NOTE      — payment details, e.g. "EcoCash 0772 000 111 (M Makonese)"
export const BILLING_EMAIL = import.meta.env.VITE_BILLING_EMAIL?.trim() || 'rentloja@gmail.com'
export const BILLING_WHATSAPP = import.meta.env.VITE_BILLING_WHATSAPP?.trim() || '263773677343'
export const BILLING_NOTE = import.meta.env.VITE_BILLING_NOTE?.trim() || ''

export function whatsappLink(text) {
  if (!BILLING_WHATSAPP) return null
  return `https://wa.me/${BILLING_WHATSAPP.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
}

// Human-readable WhatsApp number, e.g. "+263 773 677 343" (country code, then
// the rest grouped in threes). Falls back to the raw digits if unusual.
export function prettyWhatsapp() {
  const d = (BILLING_WHATSAPP || '').replace(/\D/g, '')
  if (!d) return ''
  const cc = d.slice(0, 3)
  const rest = d.slice(3).replace(/(\d{3})(?=\d)/g, '$1 ').trim()
  return rest ? `+${cc} ${rest}` : `+${d}`
}

export function mailtoLink(subject, body) {
  return `mailto:${BILLING_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
