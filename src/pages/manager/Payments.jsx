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
import { Spinner, EmptyState } from '../../components/ui.jsx'
import Modal from '../../components/Modal.jsx'
import ReceiptModal from '../../components/Receipt.jsx'
import { IconReceipt, IconWhatsapp, IconSparkle } from '../../components/icons.jsx'
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
  const [menuFor, setMenuFor] = useState(null) // payment id whose ⋯ menu is open

  useEffect(() => {
    if (!menuFor) return
    const close = () => setMenuFor(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuFor])

  // The Rejected tab badge is a notification: it counts only rejections the
  // manager hasn't seen yet, and clears once they open the tab (persisted).
  const seenKey = `rentflow_seen_rejected_${userId}`
  const [seenRejected, setSeenRejected] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`rentflow_seen_rejected_${userId}`) || '[]') } catch { return [] }
  })
  const unseenRejected = rejected.filter((p) => !seenRejected.includes(p.id)).length

  // Opening the Rejected tab marks everything currently there as seen.
  useEffect(() => {
    if (tab !== 'rejected' || rejected.length === 0) return
    const ids = rejected.map((p) => p.id)
    setSeenRejected(ids)
    try { localStorage.setItem(seenKey, JSON.stringify(ids)) } catch { /* ignore */ }
  }, [tab, rejected, seenKey])

  const load = useCallback(async () => {
    // Always clear loading, even if a call fails, so the page can never hang on a
    // single rejected request.
    try {
      const [p, rej, ref, t, pr, wm] = await Promise.all([
        db.listPayments(userId, { status: 'approved' }),
        db.listPayments(userId, { status: 'rejected' }),
        db.listRefunds(userId),
        db.listTenants(userId), db.listProperties(userId),
        db.getWorkspaceManager(userId),
      ])
      setRows(p); setRejected(rej); setRefunds(ref); setTenants(t); setProperties(pr)
      setRefundsOn(!!wm?.refunds_enabled)
    } catch (e) { console.error('Payments load failed', e) }
    finally { setLoading(false) }
  }, [userId])
  useEffect(() => {
    let alive = true
    ;(async () => {
      await load()
      // Self-heal abandoned online payments in the background, then refresh.
      try { const { changed } = await db.reconcilePayments(); if (changed && alive) await load() } catch { /* non-blocking */ }
    })()
    return () => { alive = false }
  }, [load])

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
            {t.label}{t.id === 'rejected' && unseenRejected > 0 && <span className="seg-count">{unseenRejected}</span>}
          </button>
        ))}
      </div>

      <style>{`
        .pmt-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px;
          border-bottom: 1px solid var(--line-soft); cursor: pointer; transition: background 0.13s; }
        .pmt-row:last-of-type { border-bottom: none; }
        .pmt-row:hover { background: var(--accent-bg); }
        .pmt-row:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--accent); }
        .pmt-dot { width: 9px; height: 9px; border-radius: 99px; flex-shrink: 0; }
        .pmt-pill { font-size: 0.64rem; padding: 1px 8px; margin-left: 8px; }
        .pmt-sub { font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pmt-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; min-width: 196px;
          background: var(--surface); border: 1px solid var(--line); border-radius: 10px;
          box-shadow: 0 10px 28px -12px rgba(13,27,46,0.35); padding: 5px; }
        .pmt-menu button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 11px;
          background: none; border: none; border-radius: 7px; color: var(--text); font-size: 0.86rem;
          cursor: pointer; text-align: left; }
        .pmt-menu button:hover { background: var(--accent-bg); }
        .pmt-menu button.danger { color: var(--danger); }
      `}</style>

      {tab === 'owing' && <Arrears />}
      {tab === 'advance' && <Advance />}

      {tab === 'rejected' && (
        loading ? <div className="center" style={{ minHeight: 200 }}><Spinner /></div>
          : rejected.length === 0 ? (
            <div className="card"><EmptyState icon="✅" title="No rejected payments">Payments you decline from the Approvals queue appear here with the reason.</EmptyState></div>
          ) : (
            <div className="card">
              {rejected.map((p) => (
                <div key={p.id} className="pmt-row" style={{ cursor: 'default' }}>
                  <span className="pmt-dot" style={{ background: 'var(--danger)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{fullName(tenantOf(p.tenant_id))}</span>
                    <span className="muted"> · {money(p.amount)} · {p.method}</span>
                    <div className="muted pmt-sub">
                      {fmtDate(p.created_at || p.paid_date)} · {formatPeriod({ from: p.period_from, to: p.period_to })} · <span style={{ color: 'var(--danger)' }}>{p.rejected_reason || 'No reason given'}</span>
                    </div>
                  </div>
                  <button className="btn sm ghost wa" title="Tell tenant why" onClick={() => notifyRejection(p)}><IconWhatsapp size={14} /></button>
                </div>
              ))}
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
            <div className="card">
              {refunds.map((r) => (
                <div key={r.id} className="pmt-row" style={{ cursor: 'default' }}>
                  <span className="pmt-dot" style={{ background: 'var(--danger)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{fullName(tenantOf(r.tenant_id))}</span>
                    <div className="muted pmt-sub">{fmtDate(r.refunded_on || r.created_at)} · {r.method}{r.reason ? ` · ${r.reason}` : ''}</div>
                  </div>
                  <span className="mono" style={{ fontWeight: 700, color: 'var(--danger)', whiteSpace: 'nowrap' }}>−{money(r.amount)}</span>
                </div>
              ))}
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
          /* Executive rows — amount leads, details in the subline, ⋯ for actions. */
          <div className="card">
            {filtered.map((p) => {
              const t = tenantOf(p.tenant_id)
              const dot = p.refunded ? 'var(--danger)' : p.is_advance ? 'var(--accent)' : 'var(--green)'
              return (
                <div key={p.id} className="pmt-row" role="button" tabIndex={0}
                  onClick={() => setViewing(p)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setViewing(p) }}>
                  <span className="pmt-dot" style={{ background: dot }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{fullName(t)}</span>
                    {p.paid_online && <span className="pill green pmt-pill"><span className="dot" />Online</span>}
                    {p.refunded && <span className="pill rejected pmt-pill" title={`Refunded ${money(p.refunded_amount)}`}>Refunded</span>}
                    {!p.refunded && p.is_advance && <span className="pill green pmt-pill"><IconSparkle size={11} /> Advance</span>}
                    <div className="muted pmt-sub">
                      {fmtDate(p.approved_at || p.paid_date)} · {p.method} · {formatPeriod({ from: p.period_from, to: p.period_to })}
                      {p.receipt_no ? ` · ${p.receipt_no}` : ''}{p.reference ? ` · ref ${p.reference}` : ''}
                    </div>
                  </div>
                  <span className="mono" style={{ fontWeight: 700, color: 'var(--green)', whiteSpace: 'nowrap' }}>{money(p.amount)}</span>
                  <span style={{ position: 'relative' }}>
                    <button className="btn sm ghost" aria-label="More actions"
                      onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === p.id ? null : p.id) }}>⋯</button>
                    {menuFor === p.id && (
                      <div className="pmt-menu" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => { setMenuFor(null); setViewing(p) }}><IconReceipt size={13} /> View receipt</button>
                        <button onClick={() => { setMenuFor(null); resend(p) }}><IconWhatsapp size={13} /> Resend on WhatsApp</button>
                        {refundsOn && !p.refunded && (
                          <button className="danger" onClick={() => { setMenuFor(null); setRefunding(p) }}>↩ Refund</button>
                        )}
                      </div>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        )}

      {viewing && (
        <ReceiptModal payment={viewing} tenant={tenantOf(viewing.tenant_id)} manager={profile}
          property={propOf(tenantOf(viewing.tenant_id))}
          payments={rows.filter((p) => p.tenant_id === viewing.tenant_id)}
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
