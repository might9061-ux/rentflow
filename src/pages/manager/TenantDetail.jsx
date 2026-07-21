import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { money, fullName, fmtDate } from '../../lib/format.js'
import { prettyPhone } from '../../lib/phone.js'
import { StatCard, StatusPill, PeriodTag, Spinner, EmptyState } from '../../components/ui.jsx'
import ReceiptModal from '../../components/Receipt.jsx'
import TenantModal from './TenantModal.jsx'
import CredentialsModal from './CredentialsModal.jsx'
import RecordPaymentModal from './RecordPaymentModal.jsx'
import { IconArrowRight, IconEdit, IconKey, IconReceipt, IconMail, IconPhone, IconWallet, IconDownload } from '../../components/icons.jsx'
import { downloadStatementCsv, printStatement } from '../../lib/statement.js'

export default function TenantDetail() {
  const { id } = useParams()
  const { userId, profile } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [tenant, setTenant] = useState(null)
  const [payments, setPayments] = useState([])
  const [properties, setProperties] = useState([])
  const [viewing, setViewing] = useState(null)
  const [editing, setEditing] = useState(false)
  const [creds, setCreds] = useState(null)
  const [recording, setRecording] = useState(false)
  const [stmtOpen, setStmtOpen] = useState(false)

  const load = async () => {
    const [t, pays, props] = await Promise.all([db.getTenant(id), db.listTenantPayments(id), db.listProperties(userId)])
    setTenant(t); setPayments(pays); setProperties(props); setLoading(false)
  }
  useEffect(() => { load() }, [id])

  if (loading) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>
  if (!tenant) return <div className="page"><EmptyState icon="∅" title="Tenant not found" /></div>

  const property = properties.find((p) => p.id === tenant.property_id)
  const approved = payments.filter((p) => p.status === 'approved')

  const resend = async () => {
    const { tempPassword } = await db.resendCredentials(tenant.id)
    toast.success('New credentials generated')
    setCreds({ tenant, tempPassword })
    load()
  }

  const brandOpts = {
    brandName: profile?.brand_name || 'RentLoja',
    brandColor: profile?.brand_color || '#c8a84b',
    workspace: profile?.brand_name || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim(),
  }
  const downloadCsv = () => { setStmtOpen(false); downloadStatementCsv(tenant, payments); toast.success('Statement downloaded') }
  const printPdf = () => {
    setStmtOpen(false)
    try { printStatement(tenant, payments, brandOpts) }
    catch (e) { toast.error('Could not open statement', e.message) }
  }

  return (
    <div className="page">
      <button className="btn ghost sm" onClick={() => nav('/manager/tenants')} style={{ marginBottom: 16 }}>
        <IconArrowRight size={14} style={{ transform: 'rotate(180deg)' }} /> Tenants
      </button>

      <div className="card pad" style={{ marginBottom: 20 }}>
        <div className="spread wrap" style={{ gap: 16 }}>
          <div className="row gap">
            <div className="avatar" style={{ width: 52, height: 52, fontSize: '1.2rem' }}>
              {fullName(tenant).split(' ').map((s) => s[0]).join('').slice(0, 2)}
            </div>
            <div>
              <h1 style={{ fontSize: '1.8rem' }}>{fullName(tenant)}</h1>
              <div className="row gap wrap" style={{ marginTop: 4 }}>
                <span className="row gap muted" style={{ fontSize: '0.84rem' }}><IconMail size={14} /> {tenant.email}</span>
                <span className="row gap muted" style={{ fontSize: '0.84rem' }}><IconPhone size={14} /> {prettyPhone(tenant.phone)}</span>
              </div>
            </div>
          </div>
          <div className="row gap wrap">
            <div className="stmt-wrap">
              <button className="btn ghost" onClick={() => setStmtOpen((o) => !o)}><IconDownload size={15} /> Statement</button>
              {stmtOpen && (
                <>
                  <div className="stmt-back" onClick={() => setStmtOpen(false)} />
                  <div className="stmt-menu">
                    <button onClick={printPdf}><IconReceipt size={15} /> Print / Save as PDF</button>
                    <button onClick={downloadCsv}><IconDownload size={15} /> Download CSV (Excel)</button>
                  </div>
                </>
              )}
            </div>
            <button className="btn ghost" onClick={resend}><IconKey size={15} /> Resend credentials</button>
            <button className="btn ok" onClick={() => setRecording(true)}><IconWallet size={15} /> Record payment</button>
            <button className="btn primary" onClick={() => setEditing(true)}><IconEdit size={15} /> Edit</button>
          </div>
        </div>

        <div className="row gap wrap" style={{ marginTop: 16 }}>
          <span className="pill neutral">{property?.name || 'Unassigned'} · Unit {tenant.unit || '—'}</span>
          <StatusPill status={tenant.status} />
          <StatusPill status={tenant.account_status} />
          <span className="pill neutral">Due day {tenant.due_day}</span>
          <span className="pill neutral">{tenant.email_verified ? '✓ Email' : '✗ Email'}</span>
          <span className="pill neutral">{tenant.phone_verified ? '✓ Phone' : '✗ Phone'}</span>
        </div>
      </div>

      <div className="grid stats" style={{ marginBottom: 24 }}>
        <StatCard label="Monthly rent" value={money(tenant.rent)} icon={<IconWallet size={18} />} />
        <StatCard label="Total paid" value={money(tenant.total_paid)} sub={`${approved.length} payments`} />
        <StatCard label="Credit balance" value={money(tenant.credit_balance)} sub={tenant.credit_balance > 0 ? 'Carried forward' : '—'} />
      </div>

      <h3 style={{ marginBottom: 12 }}>Payment history</h3>
      {payments.length === 0 ? (
        <div className="card"><EmptyState icon="🧾" title="No payments yet" /></div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Billing period</th><th>Amount</th><th>Method</th><th>Status</th><th>Receipt</th><th></th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="nowrap">{fmtDate(p.paid_date)}</td>
                  <td><PeriodTag from={p.period_from} to={p.period_to} /></td>
                  <td className="mono" style={{ fontWeight: 600 }}>{money(p.amount)}</td>
                  <td>{p.method}</td>
                  <td><StatusPill status={p.status} /></td>
                  <td className="mono muted">{p.receipt_no || '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {p.status === 'approved' && (
                      <button className="btn sm ghost" onClick={() => setViewing(p)}><IconReceipt size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewing && <ReceiptModal payment={viewing} tenant={tenant} manager={profile} property={property} onClose={() => setViewing(null)} />}
      {editing && (
        <TenantModal tenant={tenant} properties={properties} userId={userId}
          onClose={() => setEditing(false)} onUpdated={() => { setEditing(false); load() }} onCreated={() => {}} />
      )}
      {creds && <CredentialsModal tenant={creds.tenant} tempPassword={creds.tempPassword} onClose={() => setCreds(null)} />}
      {recording && (
        <RecordPaymentModal tenant={tenant} payments={payments}
          onClose={() => setRecording(false)}
          onRecorded={() => { setRecording(false); load() }} />
      )}

      <style>{`
        .stmt-wrap { position: relative; }
        .stmt-back { position: fixed; inset: 0; z-index: 40; }
        .stmt-menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 41; min-width: 220px;
          background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
          box-shadow: var(--shadow-soft); padding: 5px; }
        .stmt-menu button { display: flex; align-items: center; gap: 9px; width: 100%; text-align: left;
          background: transparent; border: none; color: var(--text); padding: 10px 11px; border-radius: 7px;
          font-size: 0.88rem; cursor: pointer; }
        .stmt-menu button:hover { background: var(--surface-2); }
      `}</style>
    </div>
  )
}
