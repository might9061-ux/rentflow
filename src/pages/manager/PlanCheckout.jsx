import { money } from '../../lib/format.js'
import Modal from '../../components/Modal.jsx'
import { BILLING_EMAIL, BILLING_NOTE, whatsappLink, mailtoLink } from '../../lib/platformContact.js'
import { IconWallet, IconWhatsapp, IconMail, IconInfo } from '../../components/icons.jsx'

// Activation request.
//
// This used to be a card form, but it charged nothing — it simulated a gateway
// and then switched the plan on, so anyone could type a test card number and
// give themselves a paid plan for free. Plans are now activated by the App
// owner from the admin console once payment actually lands (managers can no
// longer change their own billing columns — migration 0019), so this screen's
// job is to tell the landlord what to pay and how to reach us.
export default function PlanCheckout({ mode, capacity, price, charge, credit = 0, tierName, manager, onClose }) {
  const due = charge != null ? charge : price
  const who = [manager?.first_name, manager?.last_name].filter(Boolean).join(' ') || manager?.email || 'A manager'
  const what = mode === 'upgrade' ? `Upgrade to ${tierName}` : mode === 'installment' ? `${tierName} monthly payment` : `Activate ${tierName}`

  const subject = `RentLoja — ${what} (${money(due)})`
  const body = [
    'Hi RentLoja,', '',
    `I'd like to ${mode === 'upgrade' ? 'upgrade my plan' : mode === 'installment' ? 'pay my monthly subscription' : 'activate my plan'}.`,
    '',
    `Workspace: ${manager?.brand_name || who}`,
    `Account:   ${manager?.email || '—'}`,
    `Plan:      ${tierName} — up to ${capacity} tenants`,
    `Amount:    ${money(due)}`,
    '',
    "I'll send proof of payment. Please switch my plan on.",
  ].join('\n')

  const wa = whatsappLink(
    `${subject}\n\nWorkspace: ${manager?.brand_name || who}\nAccount: ${manager?.email || '—'}\nPlan: ${tierName} (up to ${capacity} tenants)\nAmount: ${money(due)}`,
  )

  return (
    <Modal
      title={mode === 'installment' ? 'Pay your subscription' : mode === 'upgrade' ? 'Upgrade your plan' : 'Activate your plan'}
      onClose={onClose}
      footer={<button className="btn ghost" onClick={onClose}>Close</button>}
    >
      {/* Plan summary */}
      <div className="card pad" style={{ marginBottom: 16, background: 'var(--gold-bg)', borderColor: 'var(--gold-line)' }}>
        <div className="spread wrap" style={{ gap: 10 }}>
          <div className="row gap">
            <span style={{ width: 38, height: 38, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--surface)', border: '1px solid var(--gold-line)', color: 'var(--gold)' }}><IconWallet size={18} /></span>
            <div>
              <div style={{ fontWeight: 600 }}>{tierName} plan</div>
              <div className="muted" style={{ fontSize: '0.82rem' }}>up to {capacity} tenants · billed monthly</div>
            </div>
          </div>
          <div className="mono" style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', fontWeight: 600, color: 'var(--gold)' }}>
            {money(due)}{mode !== 'upgrade' && <span style={{ fontSize: '0.7rem' }}>/mo</span>}
          </div>
        </div>
        {credit > 0 && (
          <div className="col" style={{ gap: 5, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--gold-line)', fontSize: '0.86rem' }}>
            <div className="spread"><span className="muted">New plan</span><span className="mono">{money(price)}/mo</span></div>
            <div className="spread"><span className="muted">Credit for current plan (paid this month)</span><span className="mono">−{money(credit)}</span></div>
            <div className="spread"><b>To pay</b><b className="mono">{money(due)}</b></div>
          </div>
        )}
      </div>

      <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>How to activate</h3>
      <ol className="pc-steps">
        <li><b>Send {money(due)}</b>{BILLING_NOTE ? <> to <b>{BILLING_NOTE}</b></> : ' using the details we send you'}.</li>
        <li><b>Send us the proof</b> with a button below — your details are filled in automatically.</li>
        <li>We switch your plan on, usually the same day. You can add tenants straight away.</li>
      </ol>

      {!BILLING_NOTE && (
        <div className="pc-note">
          <IconInfo size={14} />
          <span>Not sure where to send payment? Message us and we’ll send the details.</span>
        </div>
      )}

      <div className="row gap wrap" style={{ marginTop: 16 }}>
        {wa && <a className="btn primary" href={wa} target="_blank" rel="noopener noreferrer"><IconWhatsapp size={16} /> Send on WhatsApp</a>}
        <a className={wa ? 'btn ghost' : 'btn primary'} href={mailtoLink(subject, body)}><IconMail size={16} /> Email {BILLING_EMAIL}</a>
      </div>

      <style>{`
        .pc-steps { margin: 0; padding-left: 20px; display: grid; gap: 8px; font-size: 0.9rem; color: var(--text-dim); }
        .pc-steps b { color: var(--text); }
        .pc-note { display: flex; gap: 8px; align-items: flex-start; margin-top: 14px; padding: 11px 13px;
          border: 1px solid var(--line-soft); border-radius: var(--radius); background: var(--bg-raised);
          font-size: 0.82rem; color: var(--text-faint); }
        .pc-note svg { color: var(--gold); flex-shrink: 0; margin-top: 2px; }
      `}</style>
    </Modal>
  )
}
