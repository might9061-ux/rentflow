import { BILLING_EMAIL, whatsappLink, mailtoLink, prettyWhatsapp } from '../lib/platformContact.js'

// A small "Need help?" line. The audience decides who to point at:
//   mode="hq"      → RentLoja support (WhatsApp + email) — for managers and the
//                    public, whose account IS with RentLoja.
//   mode="manager" → tells a tenant to reach their property manager, since the
//                    manager (not RentLoja) owns the tenant's account & payments.
//   mode="none"    → renders nothing (e.g. the App owner's own admin login).
//
// Sourced from platformContact.js so the number/email live in one place.
export default function SupportContact({ mode = 'hq', align = 'center', style }) {
  if (mode === 'none') return null
  const base = { fontSize: '0.82rem', lineHeight: 1.7, textAlign: align, ...style }

  if (mode === 'manager') {
    return (
      <div className="muted" style={base}>
        Need help? Contact your property manager — they handle your account and payments.
      </div>
    )
  }

  const wa = whatsappLink('Hi RentLoja, I need help.')
  return (
    <div className="muted" style={base}>
      Need help?{' '}
      {wa && <><a href={wa} target="_blank" rel="noreferrer">WhatsApp {prettyWhatsapp()}</a>{' · '}</>}
      <a href={mailtoLink('RentLoja — help', '')}>{BILLING_EMAIL}</a>
    </div>
  )
}
