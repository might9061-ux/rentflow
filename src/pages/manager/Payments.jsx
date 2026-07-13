import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { money, fullName, fmtDate } from '../../lib/format.js'
import { formatPeriod, PAYMENT_METHODS } from '../../lib/billing.js'
import { sendWhatsApp, receiptMessage } from '../../lib/whatsapp.js'
import { downloadCSV } from '../../lib/csv.js'
import { downloadExcel } from '../../lib/excel.js'
import { Input, Select, Textarea } from '../../components/Field.jsx'
import { PeriodTag, Spinner, EmptyState } from '../../components/ui.jsx'
import Modal from '../../components/Modal.jsx'
import ReceiptModal from '../../components/Receipt.jsx'
import { IconReceipt, IconWhatsapp, IconSparkle, IconWarn, IconArrowRight } from '../../components/icons.jsx'
import Arrears from './Arrears.jsx'
import Advance from './Advance.jsx'

const TABS = [
  { id: 'received', label: 'Received' },
  { id: 'owing', label: 'Owing' },
  { id: 'advance', label: 'Advance' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'refunds', label: 'Refunds' },
]

export default function Payments() {
  const { userId, profile } = useAuth()
  const [tab, setTab] = useState('received')
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [rejected, setRejected] = useState([])
  const [refunds, setRefunds] = useState([])
  const [refundsOn, setRefundsOn] = useState(false)
  const [refunding, setRefunding] = useState(null) // payment being refunded
  const [tenants, setTenants] = useState([])
  const [properties, setProperties] = useState([])
  const [viewing, setViewing] = useState(null)
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    const [p, rej, ref, t, pr, wm] = await Promise.all([
      db.listPayments(userId, { status: 'approved' }),
      db.listPayments(userId, { status: 'rejected' }),
      db.listRefunds(userId),
      db.listTenants(userId), db.listProperties(userId),
      db.getWorkspaceManager(userId),
    ])
    setRows(p); setRejected(rej); setRefunds(ref); setTenants(t); setProperties(pr)
    setRefundsOn(!!wm?.refunds_enabled); setLoading(false)
  }, [userId])
  useEffect(() => { load() }, [load])

  const tenantOf = (id) => tenants.find((t) => t.id === id)
  const propOf = (t) => properties.find((p) => p.id === t?.property_id)

  const resend = (p) => {
    const t = tenantOf(p.tenant_id)
    const msg = receiptMessage({ tenant: t, payment: p, manager: profile, periodLabel: formatPeriod({ from: p.period_from, to: p.period_to }) })
    sendWhatsApp(t.phone, msg)
  }

  // Let the manager tell a tenant why a payment was rejected and ask them to resubmit.
  const notifyRejection = (p) => {
    const t = tenantOf(p.tenant_id)
    const msg = `Hi ${t?.first_name || 'there'}, your payment of ${money(p.amount)} (${p.method}) was not approved.\n` +
      `Reason: ${p.rejected_reason || 'not specified'}.\n` +
      `Please resubmit with the correct details or proof. Thank you — ${profile?.first_name || 'your manager'} (via RentLoja).`
    sendWhatsApp(t?.phone, msg)
  }

  const filtered = rows.filter((p) => {
    const q = query.toLowerCase()
    return !q || fullName(tenantOf(p.tenant_id)).toLowerCase().includes(q) || (p.receipt_no || '').toLowerCase().includes(q)
  })

  return (
    <div className="page">
      <div className="spread page-head">
        <div>
          <div className="eyebrow">Money</div>
          <h1>Payments</h1>
          <p>Received payments, who’s owing, and who’s paid ahead.</p>
        </div>
        {tab === 'received' && (
          <div className="row gap">
            <button className="btn ghost" disabled={rows.length === 0} onClick={() => exportPayments(filtered, tenantOf, 'excel')}>
              <IconReceipt size={15} /> Excel
            </button>
            <button className="btn ghost" disabled={rows.length === 0} onClick={() => exportPayments(filtered, tenantOf, 'csv')}>
              <IconReceipt size={15} /> CSV
            </button>
          </div>
        )}
      </div>

      <div className="seg" style={{ marginBottom: 20 }}>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}{t.id === 'rejected' && rejected.length > 0 && <span className="seg-count">{rejected.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'owing' && <Arrears />}
      {tab === 'advance' && <Advance />}

      {tab === 'rejected' && (
        loading ? <div className="center" style={{ minHeight: 200 }}><Spinner /></div>
          : rejected.length === 0 ? (
            <div className="card"><EmptyState icon="✅" title="No rejected payments">Payments you decline from the Approvals queue appear here with the reason.</EmptyState></div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Date</th><th>Tenant</th><th>Billing period</th><th>Amount</th><th>Method</th><th>Reason for rejection</th><th></th></tr>
                </thead>
                <tbody>
                  {rejected.map((p) => {
                    const t = tenantOf(p.tenant_id)
                    return (
                      <tr key={p.id}>
                        <td className="nowrap">{fmtDate(p.created_at || p.paid_date)}</td>
                        <td>{fullName(t)}</td>
                        <td><PeriodTag from={p.period_from} to={p.period_to} /></td>
                        <td className="mono" style={{ fontWeight: 600 }}>{money(p.amount)}</td>
                        <td>{p.method}</td>
                        <td>
                          <span className="row gap" style={{ color: 'var(--danger)' }}>
                            <IconWarn size={14} />
                            <span style={{ color: 'var(--text)' }}>{p.rejected_reason || 'Not specified'}</span>
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn sm ghost wa" title="Tell tenant why" onClick={() => notifyRejection(p)}><IconWhatsapp size={14} /></button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
      )}

      {tab === 'refunds' && (
        loading ? <div className="center" style={{ minHeight: 200 }}><Spinner /></div>
          : !refundsOn ? (
            <div className="card"><EmptyState icon="🚫" title="Refunds are turned off">
              This workspace does not offer refunds — tenants are shown this policy. You can turn refunds on in Settings → Refunds.
            </EmptyState></div>
          ) : refunds.length === 0 ? (
            <div className="card"><EmptyState icon="↩️" title="No refunds yet">Refund an approved payment from the Received tab and it will appear here.</EmptyState></div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Date</th><th>Tenant</th><th>Amount</th><th>Method</th><th>Reason</th></tr></thead>
                <tbody>
                  {refunds.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap">{fmtDate(r.refunded_on || r.created_at)}</td>
                      <td>{fullName(tenantOf(r.tenant_id))}</td>
                      <td className="mono" style={{ fontWeight: 600, color: 'var(--danger)' }}>−{money(r.amount)}</td>
                      <td>{r.method}</td>
                      <td className="muted">{r.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      )}

      {tab === 'received' && <>
      <div className="card" style={{ marginBottom: 16, padding: 12 }}>
        <input className="input" placeholder="Search by tenant or receipt no…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {loading ? <div className="center" style={{ minHeight: 200 }}><Spinner /></div>
        : filtered.length === 0 ? (
          <div className="card"><EmptyState icon="🧾" title="No payments yet">Approved payments will be listed here.</EmptyState></div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th><th>Tenant</th><th>Billing period</th><th>Amount</th>
                  <th>Method</th><th>Reference</th><th>Type</th><th>Receipt</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const t = tenantOf(p.tenant_id)
                  return (
                    <tr key={p.id} className="clickable-row" onClick={() => setViewing(p)}>
                      <td className="nowrap">{fmtDate(p.approved_at || p.paid_date)}</td>
                      <td>{fullName(t)}</td>
                      <td><PeriodTag from={p.period_from} to={p.period_to} /></td>
                      <td className="mono" style={{ fontWeight: 600 }}>{money(p.amount)}</td>
                      <td>
                        <div className="row gap">{p.method}
                          {p.paid_online && <span className="pill green" title="Paid online via gateway"><span className="dot" />Online</span>}
                        </div>
                      </td>
                      <td className="muted">{p.reference || '—'}</td>
                      <td>
                        {p.refunded
                          ? <span className="pill rejected" title={`Refunded ${money(p.refunded_amount)}`}>Refunded</span>
                          : p.is_advance
                            ? <span className="pill green"><IconSparkle size={12} /> Advance</span>
                            : <span className="pill neutral">Regular</span>}
                      </td>
                      <td className="mono muted">{p.receipt_no}</td>
                      <td>
                        <div className="row gap" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn sm ghost" title="View receipt" onClick={(e) => { e.stopPropagation(); setViewing(p) }}><IconReceipt size={14} /></button>
                          <button className="btn sm ghost wa" title="Resend on WhatsApp" onClick={(e) => { e.stopPropagation(); resend(p) }}><IconWhatsapp size={14} /></button>
                          {refundsOn && !p.refunded && (
                            <button className="btn sm ghost danger" title="Refund" onClick={(e) => { e.stopPropagation(); setRefunding(p) }}>Refund</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

      {viewing && (
        <ReceiptModal payment={viewing} tenant={tenantOf(viewing.tenant_id)} manager={profile}
          property={propOf(tenantOf(viewing.tenant_id))}
          onClose={() => setViewing(null)} onWhatsapp={() => resend(viewing)} />
      )}
      </>}

      {refunding && (
        <RefundModal userId={userId} payment={refunding} tenant={tenantOf(refunding.tenant_id)}
          onClose={() => setRefunding(null)} onDone={() => { setRefunding(null); load() }} />
      )}
    </div>
  )
}

function RefundModal({ userId, payment, tenant, onClose, onDone }) {
  const toast = useToast()
  const [amount, setAmount] = useState(payment.amount)
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState(payment.method || PAYMENT_METHODS[3] || 'Bank Transfer')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const amt = Number(amount)
    if (!(amt > 0) || amt > Number(payment.amount)) return toast.error('Enter a valid amount', `Up to ${money(payment.amount)}.`)
    setBusy(true)
    try {
      await db.refundPayment(userId, payment.id, { amount: amt, reason, method, refunded_on: date })
      toast.success(`Refunded ${money(amt)}`, 'Logged to Finances as a refund.')
      onDone()
    } catch (e) { toast.error('Could not refund', e.message); setBusy(false) }
  }

  return (
    <Modal title={`Refund ${fullName(tenant)}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary danger" onClick={submit} disabled={busy}>{busy ? 'Refunding…' : <>Refund {money(Number(amount) || 0)}</>}</button></>}>
      <div className="row gap wrap" style={{ marginTop: -6, marginBottom: 12 }}>
        <span className="pill neutral">Original payment {money(payment.amount)}</span>
        <span className="muted" style={{ fontSize: '0.82rem' }}>{payment.method} · {fmtDate(payment.approved_at || payment.paid_date)}</span>
      </div>
      <div className="field-row">
        <Input label="Refund amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>
          {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
        </Select>
      </div>
      <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being refunded?" style={{ minHeight: 70 }} />
      <p className="hint">The tenant’s total paid is reduced and a <b>Refund</b> expense is added in Finances.</p>
    </Modal>
  )
}

function exportPayments(rows, tenantOf, format) {
  const cols = [
    { header: 'Date', value: (p) => fmtDate(p.approved_at || p.paid_date) },
    { header: 'Tenant', value: (p) => fullName(tenantOf(p.tenant_id)) },
    { header: 'Period from', value: (p) => p.period_from },
    { header: 'Period to', value: (p) => p.period_to },
    { header: 'Amount', value: (p) => Number(p.amount).toFixed(2), numeric: true },
    { header: 'Method', value: (p) => p.method },
    { header: 'Reference', value: (p) => p.reference || '' },
    { header: 'Type', value: (p) => (p.is_advance ? 'Advance' : 'Regular') },
    { header: 'Paid online', value: (p) => (p.paid_online ? 'Yes' : 'No') },
    { header: 'Receipt no', value: (p) => p.receipt_no || '' },
  ]
  const base = `rentflow-payments-${new Date().toISOString().slice(0, 10)}`
  if (format === 'excel') downloadExcel(base, rows, cols, { sheet: 'Payments', title: 'RentLoja — Payments' })
  else downloadCSV(`${base}.csv`, rows, cols)
}
