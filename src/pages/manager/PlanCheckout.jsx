import { useState } from 'react'
import { useToast } from '../../context/ToastContext.jsx'
import { chargeCard, formatCardNumber, detectBrand } from '../../lib/payments.js'
import { money } from '../../lib/format.js'
import Modal from '../../components/Modal.jsx'
import { Input } from '../../components/Field.jsx'
import { Spinner } from '../../components/ui.jsx'
import { IconWallet, IconCheck } from '../../components/icons.jsx'

// Collect the installment payment. Saves the card on file via onPaid({ card, reference }).
export default function PlanCheckout({ mode, capacity, price, charge, credit = 0, tierName, manager, onClose, onPaid }) {
  const toast = useToast()
  const payNow = charge != null ? charge : price   // amount charged today (upgrade = difference)
  const saved = manager?.billing_card
  const [useNew, setUseNew] = useState(!saved)
  const [num, setNum] = useState('')
  const [exp, setExp] = useState('')
  const [cvc, setCvc] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const pay = async (e) => {
    e?.preventDefault()
    setBusy(true)
    try {
      let card, reference
      if (saved && !useNew) {
        await new Promise((r) => setTimeout(r, 1200)) // charge the card on file
        card = saved
        reference = 'SUB-' + Math.random().toString(36).slice(2, 8).toUpperCase()
      } else {
        const res = await chargeCard({ number: num, exp, cvc, name, amount: payNow })
        card = { brand: res.brand, last4: res.last4, exp, name }
        reference = res.reference
      }
      await onPaid({ card, reference })
    } catch (err) { toast.error('Payment failed', err.message); setBusy(false) }
  }

  return (
    <Modal title={mode === 'installment' ? 'Pay installment' : mode === 'upgrade' ? 'Upgrade your plan' : 'Activate your plan'} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn primary" onClick={pay} disabled={busy}>
          {busy ? <><Spinner /> Processing…</> : <>Pay {money(payNow)}</>}
        </button>
      </>}>
      {/* Plan summary */}
      <div className="card pad" style={{ marginBottom: 16, background: 'var(--gold-bg)', borderColor: 'var(--gold-line)' }}>
        <div className="spread">
          <div className="row gap">
            <span style={{ width: 38, height: 38, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--surface)', border: '1px solid var(--gold-line)', color: 'var(--gold)' }}><IconWallet size={18} /></span>
            <div>
              <div style={{ fontWeight: 600 }}>{tierName} plan</div>
              <div className="muted" style={{ fontSize: '0.82rem' }}>up to {capacity} tenants · billed monthly</div>
            </div>
          </div>
          <div className="mono" style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', fontWeight: 600, color: 'var(--gold)' }}>{money(price)}<span style={{ fontSize: '0.7rem' }}>/mo</span></div>
        </div>
        {credit > 0 && (
          <div className="col" style={{ gap: 5, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--gold-line)', fontSize: '0.86rem' }}>
            <div className="spread"><span className="muted">New plan</span><span className="mono">{money(price)}/mo</span></div>
            <div className="spread"><span className="muted">Credit for current plan (paid this month)</span><span className="mono">−{money(credit)}</span></div>
            <div className="spread"><b>Pay now</b><b className="mono">{money(payNow)}</b></div>
          </div>
        )}
      </div>

      {saved && !useNew ? (
        <div>
          <label style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>Card on file</label>
          <div className="spread" style={{ marginTop: 8, padding: '13px 15px', border: '1px solid var(--line)', borderRadius: 'var(--radius)', background: 'var(--bg)' }}>
            <div className="row gap"><IconCheck size={16} style={{ color: 'var(--green)' }} />
              <span className="mono">{saved.brand} ····{saved.last4}</span>
              <span className="muted" style={{ fontSize: '0.82rem' }}>exp {saved.exp}</span>
            </div>
          </div>
          <button type="button" className="link-btn" style={{ marginTop: 10, fontSize: '0.84rem' }} onClick={() => setUseNew(true)}>Use a different card</button>
        </div>
      ) : (
        <form onSubmit={pay}>
          <Input label="Cardholder name" value={name} onChange={(e) => setName(e.target.value)} placeholder="As shown on card" required />
          <Input label="Card number" value={num} onChange={(e) => setNum(formatCardNumber(e.target.value))} inputMode="numeric"
            placeholder="1234 5678 9012 3456" required hint={num ? detectBrand(num) : 'Visa, Mastercard, Amex'} />
          <div className="field-row">
            <Input label="Expiry (MM/YY)" value={exp} onChange={(e) => setExp(e.target.value)} placeholder="08/27" required />
            <Input label="CVC" value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="123" inputMode="numeric" required />
          </div>
          {saved && <button type="button" className="link-btn" style={{ fontSize: '0.84rem' }} onClick={() => setUseNew(false)}>Use saved card ····{saved.last4}</button>}
        </form>
      )}

      <p className="hint" style={{ marginTop: 14 }}>🔒 Your card is securely saved for future installments. Demo gateway — no real charge is made (use 4242 4242 4242 4242).</p>
    </Modal>
  )
}
