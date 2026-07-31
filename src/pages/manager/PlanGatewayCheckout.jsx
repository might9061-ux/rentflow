import { useState, useRef } from 'react'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { money } from '../../lib/format.js'
import { prettyPhone } from '../../lib/phone.js'
import Modal from '../../components/Modal.jsx'
import { Input } from '../../components/Field.jsx'
import { Spinner } from '../../components/ui.jsx'
import { IconWallet, IconPhone, IconArrowRight } from '../../components/icons.jsx'

// Pay the RentLoja subscription into the PLATFORM's Pesepay account.
//   • Card    → hosted checkout redirect (no card data touches us)
//   • EcoCash → PIN push to the phone, then poll until confirmed
// On success the plan is already activated server-side, so onDone just refreshes.
export default function PlanGatewayCheckout({ capacity, price, tierName, onClose, onDone }) {
  const toast = useToast()
  const [method, setMethod] = useState('card') // 'card' | 'ecocash'
  const [phone, setPhone] = useState('')
  const [stage, setStage] = useState('form') // form | pushing | awaiting
  const stop = useRef(false)

  const payCard = async () => {
    setStage('pushing')
    try {
      const { redirectUrl } = await db.startSubscriptionPayment({ capacity, method: 'card' })
      if (!redirectUrl) throw new Error('The gateway did not return a checkout link. Try EcoCash instead.')
      window.location.href = redirectUrl
    } catch (err) { toast.error('Could not start payment', err.message); setStage('form') }
  }

  const payEcocash = async () => {
    if (!phone.trim()) return toast.error('Enter the EcoCash number')
    stop.current = false
    setStage('pushing')
    try {
      const { payment } = await db.startSubscriptionPayment({ capacity, method: 'ecocash', phone })
      setStage('awaiting')
      for (let i = 0; i < 40; i++) {
        if (stop.current) return
        await new Promise((r) => setTimeout(r, 3000))
        const { state } = await db.subscriptionPaymentStatus(payment.id)
        if (state === 'paid') { toast.success('Plan activated', `You’re on the ${tierName} plan.`); await onDone(); return }
        if (state === 'cancelled') { toast.error('Payment not authorised', 'Declined or timed out.'); setStage('form'); return }
      }
      toast.error('Request timed out', 'You didn’t approve it in time. Try again.'); setStage('form')
    } catch (err) { toast.error('Could not start payment', err.message); setStage('form') }
  }

  if (stage !== 'form') {
    return (
      <Modal title={`Pay for ${tierName} plan`} onClose={stage === 'awaiting' ? (() => { stop.current = true; onClose() }) : undefined}>
        <div className="center" style={{ flexDirection: 'column', gap: 14, textAlign: 'center', padding: '30px 20px' }}>
          <Spinner />
          {stage === 'pushing'
            ? <div style={{ fontWeight: 600 }}>Starting payment…</div>
            : <div>
                <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>Check your phone</div>
                <div className="muted" style={{ fontSize: '0.9rem', marginTop: 4 }}>
                  Enter your EcoCash PIN on <b style={{ color: 'var(--text)' }}>{prettyPhone(phone)}</b> to pay
                  <b style={{ color: 'var(--green)' }}> {money(price)}</b> for your {tierName} plan.
                </div>
                <button className="btn ghost sm" style={{ marginTop: 16 }} onClick={() => { stop.current = true; setStage('form') }}>Cancel</button>
              </div>}
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={`Pay for ${tierName} plan`} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        {method === 'card'
          ? <button className="btn primary" onClick={payCard}>Pay {money(price)} <IconArrowRight size={15} /></button>
          : <button className="btn primary" onClick={payEcocash}><IconPhone size={15} /> Send request for {money(price)}</button>}
      </>}>
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
      </div>

      <div className="method-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <button type="button" className={`method-tile ${method === 'card' ? 'active' : ''}`} onClick={() => setMethod('card')}
          style={tileStyle(method === 'card')}>
          <IconWallet size={20} /><span style={{ fontWeight: 600 }}>Card</span>
          <span className="muted" style={{ fontSize: '.76rem' }}>Visa / Mastercard</span>
        </button>
        <button type="button" className={`method-tile ${method === 'ecocash' ? 'active' : ''}`} onClick={() => setMethod('ecocash')}
          style={tileStyle(method === 'ecocash')}>
          <IconPhone size={20} /><span style={{ fontWeight: 600 }}>EcoCash</span>
          <span className="muted" style={{ fontSize: '.76rem' }}>PIN prompt to your phone</span>
        </button>
      </div>

      {method === 'ecocash' && (
        <Input label="EcoCash number making the payment" value={phone} onChange={(e) => setPhone(e.target.value)}
          type="tel" placeholder="0772 123 456" hint="A PIN prompt is pushed to this number to authorise the payment." />
      )}

      <p className="hint" style={{ marginTop: 6 }}>🔒 Paid securely through Pesepay to RentLoja. {method === 'card'
        ? 'You’ll be taken to a secure checkout page.'
        : 'Approve the prompt on your phone to activate your plan.'}</p>
    </Modal>
  )
}

const tileStyle = (active) => ({
  display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start', textAlign: 'left', padding: 14,
  borderRadius: 'var(--radius)', border: `1px solid ${active ? 'var(--green)' : 'var(--line)'}`,
  background: active ? 'var(--green-bg)' : 'var(--bg)', color: 'var(--text)',
})
