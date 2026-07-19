// How a landlord reaches RentLoja HQ to pay for and activate their plan.
//
// Plans are activated by the App owner from the admin console after payment
// lands (managers can't switch themselves on — see migration 0019), so the
// signup flow needs to tell people exactly how to reach you.
//
// Set these in the frontend environment (Vercel) to change them without a code
// edit:
//   VITE_BILLING_EMAIL     — where activation requests should go
//   VITE_BILLING_WHATSAPP  — international digits, e.g. 263772000111
//   VITE_BILLING_NOTE      — payment details, e.g. "EcoCash 0772 000 111 (M Makonese)"
export const BILLING_EMAIL = import.meta.env.VITE_BILLING_EMAIL?.trim() || 'support@rentloja.com'
export const BILLING_WHATSAPP = import.meta.env.VITE_BILLING_WHATSAPP?.trim() || ''
export const BILLING_NOTE = import.meta.env.VITE_BILLING_NOTE?.trim() || ''

export function whatsappLink(text) {
  if (!BILLING_WHATSAPP) return null
  return `https://wa.me/${BILLING_WHATSAPP.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
}

export function mailtoLink(subject, body) {
  return `mailto:${BILLING_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
