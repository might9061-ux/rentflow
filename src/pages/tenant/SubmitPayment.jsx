import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { money } from '../../lib/format.js'
import { prettyPhone, maskPhone } from '../../lib/phone.js'
import { currentPeriod, nextPeriod, formatPeriod, previewPayment } from '../../lib/billing.js'
import {
  chargeCard, initiateEcocash, pollEcocash, cancelEcocash,
  formatCardNumber, detectBrand,
} from '../../lib/payments.js'
import { fileToProof } from '../../lib/upload.js'
import { acceptedMethods, paymentMethodsFor } from '../../lib/methods.js'
import { platformFee, PLATFORM_FEE_LABEL } from '../../lib/fees.js'
import { Input, Select } from '../../components/Field.jsx'
import { PeriodTag, Spinner, EmptyState } from '../../components/ui.jsx'
import Modal from '../../components/Modal.jsx'

import {
  IconWallet, IconSparkle, IconArrowRight, IconPhone, IconReceipt, IconCheckCircle, IconWarn, IconClock,
} from '../../components/icons.jsx'

export default function SubmitPayment() {
  const { userId, profile, refresh } = useAuth()
  const toast = useToast()
  const nav = useNavigate()

  const rent = Number(profile?.rent || 0)
  const credit = Number(profile?.credit_balance || 0)
  const currentPaid = profile?.status === 'paid'
  const period = currentPaid ? nextPeriod(currentPeriod(profile.due_day), profile.due_day) : currentPeriod(profile.due_day)

  // Which methods the manager has enabled (driven by their country).
  const [loadingCfg, setLoadingCfg] = useState(true)
  const [accepted, setAccepted] = useState([])
  const [options, setOptions] = useState([])
  const [payDetails, setPayDetails] = useState({})
  const [method, setMethod] = useState(null) // 'card' | 'express' | 'manual'
  const [amount, setAmount] = useState(rent || '')
  const [refundsOn, setRefundsOn] = useState(null)
  const [submitted, setSubmitted] = useState(null) // awaiting-approval confirmation

  useEffect(() => {
    (async () => {
      const m = await db.getTenantManager(userId)
      const opts = paymentMethodsFor(m)
      const acc = acceptedMethods(m)
      setOptions(opts); setAccepted(acc)
      setRefundsOn(!!m?.refunds_enabled)
      setPayDetails(m?.payment_details || {})
      const sCard = acc.includes('card')
      const expr = opts.find((o) => o.kind === 'online' && o.key !== 'card' && acc.includes(o.key))
      const sManual = opts.some((o) => o.kind === 'manual' && acc.includes(o.key))
      setMethod(sCard ? 'card' : expr ? 'express' : sManual ? 'manual' : null)
      setLoadingCfg(false)
    })()
  }, [userId])

  const showCard = accepted.includes('card')
  const expressOpt = options.find((o) => o.kind === 'online' && o.key !== 'card' && accepted.includes(o.key))
  const showExpress = !!expressOpt
  const manualMethods = options.filter((o) => o.kind === 'manual' && accepted.includes(o.key)).map((o) => o.key)
  const showManual = manualMethods.length > 0
  const amt = Number(amount) || 0
  const fee = platformFee(amt)        // 0.5% paid by the tenant, on top
  const total = amt + fee             // what the tenant actually pays
  const preview = amt > 0 ? previewPayment({ rent, creditBalance: credit, amount: amt, currentPaid }) : null

  const finishOnline = async (data) => {
    // Online payments are recorded as PENDING and still need the manager to
    // approve them (a real gateway webhook would auto-confirm; here the manager
    // does). So confirm it was sent + is awaiting approval — not "receipted".
    await db.submitOnlinePayment(userId, {
      amount: amt, fee, paid_date: new Date().toISOString().slice(0, 10),
      period_from: period.from, period_to: period.to, ...data,
    })
    await refresh()
    setSubmitted({ amount: amt, method: data.method || 'Online payment', period })
  }

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div className="page-head">
        <div className="eyebrow">Pay rent</div>
        <h1>Make a payment</h1>
        <p>Pay online instantly, or upload proof of a payment you’ve made.</p>
      </div>

      <div className="card pad" style={{ marginBottom: 18 }}>
        <div className="spread wrap" style={{ gap: 12 }}>
          <div className="row gap"><IconWallet size={18} style={{ color: 'var(--green)' }} />
            <span>Paying for</span><PeriodTag period={period} /></div>
          <div className="muted">Rent {money(rent)}{credit > 0 ? ` · Credit ${money(credit)}` : ''}</div>
        </div>
        {currentPaid && <p className="hint" style={{ marginTop: 10 }}>This month is already covered — this payment is applied to the next billing period.</p>}
        {refundsOn === false && (
          <div className="row gap" style={{ marginTop: 10, color: 'var(--text-faint)', fontSize: '0.8rem' }}>
            <IconWarn size={13} /> This manager does not offer refunds. Please check the amount before paying.
          </div>
        )}
      </div>

      {/* Amount */}
      <div className="card pad" style={{ marginBottom: 16 }}>
        <Input label="Rent amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required
          hint={`Tip: pay more than ${money(rent)} to build credit for next month.`} />
        {amt > 0 && (
          <div className="fee-box">
            <div className="spread"><span className="muted">Rent</span><span className="mono">{money(amt)}</span></div>
            <div className="spread"><span className="muted">Platform fee ({PLATFORM_FEE_LABEL})</span><span className="mono">{money(fee)}</span></div>
            <div className="spread fee-total"><b>Total to pay</b><b className="mono">{money(total)}</b></div>
          </div>
        )}
        {preview && (
          <div className="banner" style={{ margin: '6px 0 0' }}>
            <div className="b-ico"><IconSparkle size={18} /></div>
            <div>
              {preview.coversCurrent
                ? <div style={{ fontWeight: 600 }}>Covers the {formatPeriod(period)} rent in full.</div>
                : <div style={{ fontWeight: 600 }}>Partial — {money(rent - (credit + amt))} would remain for this period.</div>}
              {preview.newCredit > 0 && (
                <div className="muted" style={{ fontSize: '0.84rem' }}>{money(preview.newCredit)} extra → carried forward as credit.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Method picker — only the methods your manager has enabled */}
      {loadingCfg ? (
        <div className="card pad center" style={{ minHeight: 120 }}><Spinner /></div>
      ) : !method ? (
        <div className="card"><EmptyState icon="🔒" title="No payment methods available">
          Your manager hasn’t enabled any payment options yet. Please contact them.
        </EmptyState></div>
      ) : (
        <>
          <div className="method-grid" style={{ gridTemplateColumns: `repeat(${[showCard, showExpress, showManual].filter(Boolean).length || 1}, 1fr)` }}>
            {showCard && <MethodTile active={method === 'card'} onClick={() => setMethod('card')}
              icon={<IconWallet size={20} />} title="Card" sub="Visa / Mastercard" />}
            {showExpress && <MethodTile active={method === 'express'} onClick={() => setMethod('express')}
              icon={<IconPhone size={20} />} title={expressOpt.label.replace(' express', '')} sub="PIN prompt to your phone" />}
            {showManual && <MethodTile active={method === 'manual'} onClick={() => setMethod('manual')}
              icon={<IconReceipt size={20} />} title="Upload proof" sub={manualMethods.slice(0, 3).join(', ')} />}
          </div>

          {method === 'card' && <CardForm amt={amt} charge={total} onPaid={finishOnline} />}
          {method === 'express' && <ExpressForm amt={amt} charge={total} label={expressOpt.label.replace(' express', '')} defaultPhone={profile?.phone} onPaid={finishOnline} />}
          {method === 'manual' && <ManualForm amt={amt} fee={fee} charge={total} userId={userId} period={period} refresh={refresh} nav={nav} methods={manualMethods} details={payDetails} />}
        </>
      )}

      <style>{`
        .method-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:18px; }
        .method-tile { display:flex; flex-direction:column; gap:6px; align-items:flex-start; text-align:left;
          padding:16px; border-radius:var(--radius); border:1px solid var(--line); background:var(--bg); color:var(--text); transition:all .15s; }
        .method-tile:hover { border-color:var(--green-line); }
        .method-tile.active { border-color:var(--green); background:var(--green-bg); }
        .method-tile .m-ico { width:40px;height:40px;border-radius:11px;display:grid;place-items:center;
          background:var(--surface-2);border:1px solid var(--line); }
        .method-tile.active .m-ico { color:var(--green); border-color:var(--green-line); }
        .method-tile .m-title { font-weight:600; }
        .method-tile .m-sub { font-size:.76rem; color:var(--text-faint); }
        @media (max-width:560px){ .method-grid{ grid-template-columns:1fr; } }
      `}</style>

      {submitted && <PendingApprovalModal data={submitted} onClose={() => nav('/tenant/history')} />}
    </div>
  )
}

function MethodTile({ active, onClick, icon, title, sub }) {
  return (
    <button type="button" className={`method-tile ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="m-ico">{icon}</span>
      <span className="m-title">{title}</span>
      <span className="m-sub">{sub}</span>
    </button>
  )
}

// ── Card ────────────────────────────────────────────────────────────────────
function CardForm({ amt, charge, onPaid }) {
  const toast = useToast()
  const [num, setNum] = useState('')
  const [exp, setExp] = useState('')
  const [cvc, setCvc] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const brand = detectBrand(num)

  const pay = async (e) => {
    e.preventDefault()
    if (amt <= 0) return toast.error('Enter an amount first')
    setBusy(true)
    try {
      const res = await chargeCard({ number: num, exp, cvc, name, amount: charge })
      await onPaid({ method: `${res.brand} ····${res.last4}`, reference: res.reference })
    } catch (err) { toast.error('Payment failed', err.message); setBusy(false) }
  }

  return (
    <form onSubmit={pay} className="card pad">
      <Input label="Cardholder name" value={name} onChange={(e) => setName(e.target.value)} placeholder="As shown on card" required />
      <Input label="Card number" value={num} onChange={(e) => setNum(formatCardNumber(e.target.value))}
        inputMode="numeric" placeholder="1234 5678 9012 3456" required
        hint={num ? brand : 'Visa, Mastercard, Amex'} />
      <div className="field-row">
        <Input label="Expiry (MM/YY)" value={exp} onChange={(e) => setExp(e.target.value)} placeholder="08/27" required />
        <Input label="CVC" value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="123" inputMode="numeric" required />
      </div>
      <p className="hint" style={{ marginBottom: 12 }}>🔒 Demo gateway — no real card is charged. Use 4242 4242 4242 4242 to succeed, 4000 0000 0000 0002 to see a decline.</p>
      <button className="btn primary block lg" disabled={busy}>
        {busy ? <><Spinner /> Processing…</> : <>Pay {money(charge)} <IconArrowRight size={16} /></>}
      </button>
    </form>
  )
}

// ── Mobile-money express (EcoCash / M-Pesa / …) ─────────────────────────────
function ExpressForm({ amt, charge, label, defaultPhone, onPaid }) {
  const toast = useToast()
  const [phone, setPhone] = useState(defaultPhone || '')
  const [stage, setStage] = useState('form') // form | pushing | awaiting
  const pollRef = useRef({ id: null, stop: false })

  const start = async (e) => {
    e.preventDefault()
    if (amt <= 0) return toast.error('Enter an amount first')
    setStage('pushing')
    try {
      const { pollId } = await initiateEcocash({ phone, amount: charge, reference: 'RENT' })
      pollRef.current = { id: pollId, stop: false }
      setStage('awaiting')
      // Poll until the user authorises on their handset.
      for (let i = 0; i < 30; i++) {
        if (pollRef.current.stop) return
        await new Promise((r) => setTimeout(r, 1200))
        const status = await pollEcocash(pollId)
        if (status === 'paid') {
          await onPaid({ method: label, reference: pollId, payer_phone: phone })
          return
        }
        if (status === 'cancelled') { toast.error('Payment not authorised', 'The request was declined or timed out.'); setStage('form'); return }
      }
      toast.error('Request timed out', 'You didn’t approve it in time. Try again.')
      setStage('form')
    } catch (err) { toast.error('Could not start payment', err.message); setStage('form') }
  }

  const cancel = () => { pollRef.current.stop = true; cancelEcocash(pollRef.current.id); setStage('form') }

  if (stage !== 'form') {
    return (
      <div className="card pad center" style={{ flexDirection: 'column', gap: 14, textAlign: 'center', padding: '34px 22px' }}>
        <Spinner />
        {stage === 'pushing'
          ? <div><div style={{ fontWeight: 600 }}>Sending request…</div><div className="muted" style={{ fontSize: '0.85rem' }}>Contacting {label}</div></div>
          : <div>
              <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>Check your phone</div>
              <div className="muted" style={{ fontSize: '0.9rem', marginTop: 4 }}>
                Enter your {label} PIN on <b style={{ color: 'var(--text)' }}>{prettyPhone(phone)}</b> to approve
                <b style={{ color: 'var(--green)' }}> {money(charge)}</b> to RentFlow.
              </div>
              <button className="btn ghost sm" onClick={cancel} style={{ marginTop: 16 }}>Cancel</button>
            </div>}
      </div>
    )
  }

  return (
    <form onSubmit={start} className="card pad">
      <Input label={`${label} number making the payment`} value={phone} onChange={(e) => setPhone(e.target.value)}
        type="tel" placeholder="0772 123 456" required
        hint="A PIN prompt is pushed to this number to authorise the payment." />
      <p className="hint" style={{ marginBottom: 12 }}>🔒 Demo gateway — no real money moves. The prompt auto-approves after a few seconds (a number ending 0000 simulates a decline).</p>
      <button className="btn primary block lg"><IconPhone size={16} /> Send payment request for {money(charge)}</button>
    </form>
  )
}

// ── Manual / upload proof ───────────────────────────────────────────────────
function ManualForm({ amt, fee, charge, userId, period, refresh, nav, methods, details = {} }) {
  const toast = useToast()
  const [method, setMethod] = useState(methods[0])
  const payTo = (details[method] || '').trim()
  const [reference, setReference] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [proof, setProof] = useState(null) // { url, type, name }
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(null) // shows the awaiting-approval prompt
  const fileRef = useRef(null)

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try { setProof(await fileToProof(file)) }
    catch (err) { toast.error('Upload failed', err.message) }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (amt <= 0) return toast.error('Enter an amount first')
    if (!reference.trim() && !proof) return toast.error('Add a reference or upload proof')
    setBusy(true)
    try {
      await db.submitPayment(userId, {
        amount: amt, fee, method, reference, paid_date: date,
        period_from: period.from, period_to: period.to,
        proof_url: proof?.url || null,
      })
      await refresh()
      setSubmitted({ amount: amt, method, period })
    } catch (err) { toast.error('Could not submit', err.message); setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="card pad">
      <Select label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)}>
        {methods.map((m) => <option key={m}>{m}</option>)}
      </Select>

      <div className="fee-box" style={{ marginBottom: 14 }}>
        <div className="spread"><span className="muted">Rent</span><span className="mono">{money(amt)}</span></div>
        <div className="spread"><span className="muted">Platform fee (0.5%)</span><span className="mono">{money(fee)}</span></div>
        <div className="spread fee-total"><b>Total to send</b><b className="mono">{money(charge)}</b></div>
      </div>

      {payTo ? (
        <div className="paydest">
          <div className="pd-head"><IconWallet size={15} /> Send your {method} payment to:</div>
          <pre className="pd-body">{payTo}</pre>
          <button type="button" className="btn sm ghost" onClick={() => { navigator.clipboard?.writeText(payTo); toast.success('Copied') }}>Copy details</button>
        </div>
      ) : (
        <p className="hint" style={{ marginBottom: 14 }}>Ask your manager where to send this {method} payment.</p>
      )}

      <Input label="Transaction reference" value={reference} onChange={(e) => setReference(e.target.value)}
        placeholder="e.g. confirmation code / deposit slip no." />
      <Input label="Date paid" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />

      <div className="field">
        <label>Receipt / screenshot <span className="muted">(reference number visible)</span></label>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={onFile} style={{ display: 'none' }} />
        {proof ? (
          <div className="proof-preview">
            {proof.type === 'image'
              ? <img src={proof.url} alt="proof" />
              : <div className="proof-file"><IconReceipt size={20} /> {proof.name}</div>}
            <div className="row gap">
              <button type="button" className="btn sm ghost" onClick={() => fileRef.current?.click()}>Replace</button>
              <button type="button" className="btn sm ghost danger" onClick={() => setProof(null)}>Remove</button>
            </div>
          </div>
        ) : (
          <button type="button" className="dropzone" onClick={() => fileRef.current?.click()}>
            <IconReceipt size={22} />
            <span>Click to upload a receipt or screenshot</span>
            <span className="muted" style={{ fontSize: '0.76rem' }}>PNG, JPG or PDF</span>
          </button>
        )}
      </div>

      <div className="banner gold" style={{ marginTop: 4 }}>
        <div className="b-ico"><IconWarn size={18} /></div>
        <div style={{ fontSize: '0.86rem' }}>Manual payments need manager approval. Make sure the reference number is clearly visible in your upload.</div>
      </div>

      <button className="btn primary block lg" disabled={busy} style={{ marginTop: 8 }}>
        {busy ? 'Submitting…' : <>Submit for approval <IconArrowRight size={16} /></>}
      </button>

      <style>{`
        .dropzone { width:100%; display:flex; flex-direction:column; align-items:center; gap:6px; padding:26px;
          border:1.5px dashed var(--line); border-radius:var(--radius); background:var(--bg); color:var(--text-dim); transition:all .15s; }
        .dropzone:hover { border-color:var(--green-line); color:var(--text); }
        .proof-preview { display:flex; align-items:center; gap:14px; padding:12px; border:1px solid var(--line); border-radius:var(--radius); }
        .proof-preview img { width:88px; height:88px; object-fit:cover; border-radius:9px; border:1px solid var(--line); }
        .proof-file { display:flex; align-items:center; gap:8px; font-size:.86rem; }
        .paydest { border:1px solid var(--green-line); background:var(--green-bg); border-radius:var(--radius); padding:14px 16px; margin-bottom:16px; }
        .paydest .pd-head { display:flex; align-items:center; gap:8px; font-weight:600; font-size:.9rem; color:var(--green); margin-bottom:8px; }
        .paydest .pd-body { font-family:var(--sans); white-space:pre-wrap; font-size:.88rem; color:var(--text); margin:0 0 10px; line-height:1.5; }
      `}</style>

      {submitted && <PendingApprovalModal data={submitted} onClose={() => nav('/tenant/history')} />}
    </form>
  )
}

// Clear confirmation that a manual payment was sent and is now awaiting the
// manager's approval (it stays "Pending" until they review it).
function PendingApprovalModal({ data, onClose }) {
  return (
    <Modal title="Payment sent" onClose={onClose}
      footer={<button className="btn primary block" onClick={onClose}>View payment history</button>}>
      <div style={{ textAlign: 'center', padding: '4px 0 2px' }}>
        <div className="pa-ico"><IconClock size={30} /></div>
        <h3 style={{ marginTop: 14, fontSize: '1.25rem' }}>Waiting for approval</h3>
        <p className="muted" style={{ marginTop: 6 }}>
          Your {data.method} payment of <b style={{ color: 'var(--text)' }}>{money(data.amount)}</b> for {formatPeriod(data.period)} has
          been sent to your manager. You’ll be notified once it’s approved and a receipt is issued.
        </p>
      </div>
      <div className="banner gold" style={{ marginTop: 16 }}>
        <div className="b-ico"><IconWarn size={18} /></div>
        <div style={{ fontSize: '0.86rem' }}>It shows as <b>Pending</b> in your payment history until your manager approves it.</div>
      </div>
      <style>{`.pa-ico{width:62px;height:62px;border-radius:50%;display:grid;place-items:center;margin:0 auto;background:var(--gold-bg);border:1px solid var(--gold-line);color:var(--gold);}`}</style>
    </Modal>
  )
}
