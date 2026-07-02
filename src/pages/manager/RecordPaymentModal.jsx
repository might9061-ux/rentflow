import { useState } from 'react'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { money, fullName } from '../../lib/format.js'
import { PAYMENT_METHODS, formatPeriod } from '../../lib/billing.js'
import { computeArrears, oldestUnpaidPeriod } from '../../lib/arrears.js'
import Modal from '../../components/Modal.jsx'
import { Input, Select, Row } from '../../components/Field.jsx'
import { PeriodTag } from '../../components/ui.jsx'

// Manager records a payment the tenant made (e.g. cash). Auto-approved.
export default function RecordPaymentModal({ tenant, payments = [], onClose, onRecorded }) {
  const toast = useToast()
  const arr = computeArrears(tenant, payments)
  const period = oldestUnpaidPeriod(tenant, payments)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    amount: (arr.total || tenant.rent || '') + '',
    method: 'Cash USD',
    paid_date: new Date().toISOString().slice(0, 10),
    reference: '',
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!(Number(form.amount) > 0)) return toast.error('Enter an amount')
    setBusy(true)
    try {
      const p = await db.recordCashPayment(tenant.id, {
        amount: Number(form.amount), method: form.method, reference: form.reference,
        paid_date: form.paid_date, period_from: period.from, period_to: period.to,
      })
      toast.success('Payment recorded', `Receipt ${p.receipt_no} issued for ${fullName(tenant)}.`)
      onRecorded(p)
    } catch (err) { toast.error('Could not record', err.message); setBusy(false) }
  }

  return (
    <Modal title={`Record payment — ${fullName(tenant)}`} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" form="rec-form" disabled={busy}>{busy ? 'Recording…' : 'Record & issue receipt'}</button>
      </>}>
      <p className="muted" style={{ marginBottom: 14 }}>
        Log a payment the tenant made directly (cash, mobile money, etc.). It’s approved instantly and a receipt is generated.
      </p>

      <div className="card pad" style={{ marginBottom: 16, background: 'var(--surface-2)' }}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="muted">Applying to</span><PeriodTag period={period} />
        </div>
        <div className="spread"><span className="muted">Outstanding (incl. brought forward)</span>
          <b className="mono" style={{ color: arr.total > 0 ? 'var(--warn)' : 'var(--green)' }}>{money(arr.total)}</b></div>
      </div>

      <form id="rec-form" onSubmit={submit}>
        <Row>
          <Input label="Amount (USD)" type="number" min="0" step="0.01" value={form.amount} onChange={set('amount')} required autoFocus />
          <Select label="Method" value={form.method} onChange={set('method')}>
            {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
          </Select>
        </Row>
        <Row>
          <Input label="Date received" type="date" value={form.paid_date} onChange={set('paid_date')} required />
          <Input label="Reference (optional)" value={form.reference} onChange={set('reference')} placeholder="e.g. receipt book no." />
        </Row>
        <p className="hint">Paying {money(Number(form.amount) || 0)} against {formatPeriod(period)}. Any surplus becomes credit for next month.</p>
      </form>
    </Modal>
  )
}
