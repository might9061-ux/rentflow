import { useState } from 'react'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { money } from '../../lib/format.js'
import Modal from '../../components/Modal.jsx'
import { Spinner } from '../../components/ui.jsx'
import { IconWallet, IconArrowRight } from '../../components/icons.jsx'

// Pay the RentLoja subscription into the PLATFORM's Pesepay account through
// Pesepay's own hosted checkout page — where the manager can pay by Card,
// EcoCash, InnBucks, ZimSwitch or Omari. (We used to try an in-app EcoCash
// PIN-push, but that "seamless" flow isn't enabled on the account; the hosted
// page supports every method and just works.)
//
// On return the plan is activated server-side — the Pesepay result webhook
// settles it, and the Plan page also resume-polls the pending payment (it
// stashes the id in localStorage below) so the UI updates promptly either way.
export default function PlanGatewayCheckout({ capacity, price, tierName, cycle, onClose }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const pay = async () => {
    setBusy(true)
    try {
      const { payment, redirectUrl } = await db.startSubscriptionPayment({ capacity, method: 'card', cycle })
      if (!redirectUrl) throw new Error('Pesepay didn’t return a checkout link. Please try again in a moment.')
      try { localStorage.setItem('rentflow_pending_sub', payment.id) } catch { /* ignore */ }
      window.location.href = redirectUrl
    } catch (err) { toast.error('Could not start payment', err.message); setBusy(false) }
  }

  return (
    <Modal title={`Pay for ${tierName} plan`} onClose={busy ? undefined : onClose}
      footer={busy ? null : <>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={pay}>Pay {money(price)} <IconArrowRight size={15} /></button>
      </>}>
      {busy ? (
        <div className="center" style={{ flexDirection: 'column', gap: 14, padding: '30px 20px' }}>
          <Spinner /><div style={{ fontWeight: 600 }}>Taking you to Pesepay…</div>
        </div>
      ) : (
        <>
          <div className="card pad" style={{ marginBottom: 16, background: 'var(--gold-bg)', borderColor: 'var(--gold-line)' }}>
            <div className="spread">
              <div className="row gap">
                <span style={{ width: 38, height: 38, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--surface)', border: '1px solid var(--gold-line)', color: 'var(--gold)' }}><IconWallet size={18} /></span>
                <div>
                  <div style={{ fontWeight: 600 }}>{tierName} plan</div>
                  <div className="muted" style={{ fontSize: '0.82rem' }}>up to {capacity} tenants · billed {cycle === 'yearly' ? 'yearly' : 'monthly'}</div>
                </div>
              </div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', fontWeight: 600, color: 'var(--gold)' }}>{money(price)}</div>
            </div>
          </div>
          <p className="hint">🔒 You’ll be taken to Pesepay’s secure page, where you can pay by <b>Card, EcoCash, InnBucks, ZimSwitch or Omari</b>. Your plan activates as soon as the payment is confirmed.</p>
        </>
      )}
    </Modal>
  )
}
