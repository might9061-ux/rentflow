import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { money, fullName, fmtDate } from '../../lib/format.js'
import { applyPayment, formatPeriod } from '../../lib/billing.js'
import { sendWhatsApp, receiptMessage } from '../../lib/whatsapp.js'
import Modal from '../../components/Modal.jsx'
import { Textarea } from '../../components/Field.jsx'
import { StatusPill, PeriodTag, Spinner, EmptyState, CountBadge } from '../../components/ui.jsx'
import { IconCheck, IconX, IconWhatsapp, IconSparkle, IconReceipt } from '../../components/icons.jsx'

export default function Approvals() {
  const { userId, profile } = useAuth()
  const toast = useToast()
  const ctx = useOutletContext()
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState([])
  const [tenants, setTenants] = useState([])
  const [rejecting, setRejecting] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [proofView, setProofView] = useState(null)

  const load = async () => {
    const [rows, t] = await Promise.all([db.listPayments(userId, { status: 'pending' }), db.listTenants(userId)])
    // Online (gateway) payments are confirmed automatically by the provider —
    // they must never be approved by hand, so keep them out of this manual
    // queue. Only proof/manual payments need a human review here.
    setPending(rows.filter((p) => !p.paid_online)); setTenants(t); setLoading(false)
    ctx?.reloadPending?.()
  }
  useEffect(() => { load() }, [userId])

  const tenantOf = (id) => tenants.find((t) => t.id === id)

  const approve = async (p) => {
    setBusyId(p.id)
    try {
      const approved = await db.approvePayment(p.id)
      const t = tenantOf(p.tenant_id)
      toast.success('Payment approved', `Receipt ${approved.receipt_no} generated.`)
      // Open WhatsApp with the receipt pre-filled.
      const msg = receiptMessage({ tenant: t, payment: approved, manager: profile, periodLabel: formatPeriod({ from: p.period_from, to: p.period_to }) })
      sendWhatsApp(t.phone, msg)
      load()
    } catch (e) { toast.error('Could not approve', e.message) }
    finally { setBusyId(null) }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="row gap">
          <div className="eyebrow">Review queue</div>
          {pending.length > 0 && <CountBadge n={pending.length} />}
        </div>
        <h1>Payment approvals</h1>
        <p>Approve to issue a receipt, or reject with a reason.</p>
      </div>

      {loading ? <div className="center" style={{ minHeight: 200 }}><Spinner /></div>
        : pending.length === 0 ? (
          <div className="card"><EmptyState icon="✓" title="No pending payments">When tenants submit payments they’ll appear here.</EmptyState></div>
        ) : (
          <div className="col" style={{ gap: 14 }}>
            {pending.map((p) => {
              const t = tenantOf(p.tenant_id)
              const calc = applyPayment({ rent: t?.rent || 0, creditBalance: t?.credit_balance || 0, amount: p.amount })
              return (
                <div key={p.id} className="card pad">
                  <div className="spread wrap" style={{ gap: 16 }}>
                    <div className="grow" style={{ minWidth: 220 }}>
                      <div className="spread">
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{fullName(t)}</div>
                          <div className="muted" style={{ fontSize: '0.84rem' }}>Unit {t?.unit || '—'} · submitted {fmtDate(p.created_at)}</div>
                        </div>
                        <StatusPill status="pending" />
                      </div>
                      <div className="row gap wrap" style={{ marginTop: 12 }}>
                        <PeriodTag from={p.period_from} to={p.period_to} />
                        <span className="pill neutral">{p.method}</span>
                        {p.reference && <span className="pill neutral">Ref: {p.reference}</span>}
                        {p.payer_phone && <span className="pill neutral">From {p.payer_phone}</span>}
                      </div>
                      {p.proof_url && (
                        <button type="button" className="proof-thumb" onClick={() => setProofView(p.proof_url)}>
                          <img src={p.proof_url} alt="payment proof" />
                          <span className="row gap"><IconReceipt size={14} /> View proof</span>
                        </button>
                      )}
                      {calc.isAdvance && (
                        <div className="row gap" style={{ marginTop: 10, color: 'var(--green)', fontSize: '0.83rem' }}>
                          <IconSparkle size={14} /> Advance — {money(calc.newCredit)} will carry forward as credit.
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div className="mono" style={{ fontFamily: 'var(--serif)', fontSize: '1.9rem', fontWeight: 600 }}>{money(p.amount)}</div>
                      <div className="muted" style={{ fontSize: '0.78rem' }}>rent {money(t?.rent)}</div>
                    </div>
                  </div>

                  <div className="divider" />
                  <div className="row gap" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn danger" disabled={busyId === p.id} onClick={() => setRejecting(p)}><IconX size={15} /> Reject</button>
                    <button className="btn ok" disabled={busyId === p.id} onClick={() => approve(p)}>
                      <IconCheck size={15} /> {busyId === p.id ? 'Approving…' : 'Approve & send receipt'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

      {rejecting && (
        <RejectModal payment={rejecting} tenant={tenantOf(rejecting.tenant_id)}
          onClose={() => setRejecting(null)}
          onRejected={() => { setRejecting(null); load() }} />
      )}

      {proofView && (
        <Modal title="Payment proof" onClose={() => setProofView(null)}
          footer={<button className="btn primary" onClick={() => setProofView(null)}>Close</button>}>
          {proofView.startsWith('data:application/pdf') || proofView.includes('application/pdf')
            ? <iframe title="proof" src={proofView} style={{ width: '100%', height: 460, border: '1px solid var(--line)', borderRadius: 'var(--radius)' }} />
            : <img src={proofView} alt="payment proof" style={{ width: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--line)' }} />}
        </Modal>
      )}

      <style>{`
        .proof-thumb { display:flex; align-items:center; gap:10px; margin-top:12px; padding:6px 10px 6px 6px;
          border:1px solid var(--line); border-radius:10px; background:var(--bg); color:var(--text-dim); font-size:.83rem; }
        .proof-thumb:hover { color:var(--text); border-color:var(--gold-line); }
        .proof-thumb img { width:42px; height:42px; object-fit:cover; border-radius:7px; border:1px solid var(--line); }
      `}</style>
    </div>
  )
}

function RejectModal({ payment, tenant, onClose, onRejected }) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      await db.rejectPayment(payment.id, reason)
      toast.info('Payment rejected', 'Logged as rejected.')
      onRejected()
    } catch (e) { toast.error('Could not reject', e.message); setBusy(false) }
  }
  return (
    <Modal title={`Reject payment from ${fullName(tenant)}`} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn danger" onClick={submit} disabled={busy}>{busy ? 'Rejecting…' : 'Reject payment'}</button>
      </>}>
      <Textarea label="Reason (optional)" placeholder="e.g. Reference number could not be verified." value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  )
}
