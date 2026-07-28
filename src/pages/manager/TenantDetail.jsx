import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { money, fullName, fmtDate } from '../../lib/format.js'
import { prettyPhone } from '../../lib/phone.js'
import { StatCard, StatusPill, PeriodTag, Spinner, EmptyState } from '../../components/ui.jsx'
import ReceiptModal from '../../components/Receipt.jsx'
import Modal from '../../components/Modal.jsx'
import TenantModal from './TenantModal.jsx'
import CredentialsModal from './CredentialsModal.jsx'
import RecordPaymentModal from './RecordPaymentModal.jsx'
import { IconArrowRight, IconEdit, IconKey, IconReceipt, IconMail, IconPhone, IconWallet, IconDownload, IconClock } from '../../components/icons.jsx'
import { downloadStatementCsv, printStatement } from '../../lib/statement.js'
import { sendWhatsApp, receiptMessage } from '../../lib/whatsapp.js'
import { formatPeriod } from '../../lib/billing.js'
import { buildLedger } from '../../lib/ledger.js'

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
  const [showVacate, setShowVacate] = useState(false)

  const load = async () => {
    const [t, pays, props] = await Promise.all([db.getTenant(id), db.listTenantPayments(id), db.listProperties(userId)])
    setTenant(t); setPayments(pays); setProperties(props); setLoading(false)
  }
  useEffect(() => { load() }, [id])

  if (loading) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>
  if (!tenant) return <div className="page"><EmptyState icon="∅" title="Tenant not found" /></div>

  const property = properties.find((p) => p.id === tenant.property_id)
  const approved = payments.filter((p) => p.status === 'approved')
  // Derive totals from the actual approved payments + the shared ledger, so they
  // stay accurate even if a payment is edited/removed directly in the database
  // (the stored total_paid / credit_balance are only snapshots from approvals).
  const totalPaid = approved.reduce((s, p) => s + Number(p.amount || 0), 0)
  const led = buildLedger({ payments, rent: Number(tenant.rent || 0), dueDay: tenant.due_day, startDate: tenant.lease_start || tenant.created_at })
  const credit = led.creditAdvance
  const vacatedAt = tenant.vacated_at
  const deletedAt = tenant.deleted_at

  const resend = async () => {
    const { tempPassword } = await db.resendCredentials(tenant.id)
    toast.success('New credentials generated')
    setCreds({ tenant, tempPassword })
    load()
  }

  // Vacate = archive the tenancy: free their unit and block sign-in, but keep the
  // record + payment history until the manager deletes it.
  const vacate = async () => {
    try {
      await db.updateTenant(tenant.id, { vacated_at: new Date().toISOString(), account_status: 'suspended', property_id: null, unit: '' })
      toast.success('Tenant vacated', 'Their record is archived and the unit is freed.')
      setShowVacate(false); load()
    } catch (e) { toast.error('Could not vacate', e.message) }
  }
  const deleteNow = async () => {
    try {
      await db.deleteTenant(tenant.id)
      toast.success('Tenant deleted', 'Their login and record were removed — payment history is kept in your Finances.')
      nav('/manager/tenants')
    } catch (e) { toast.error('Could not delete', e.message) }
  }
  const restore = async () => {
    try {
      await db.updateTenant(tenant.id, { vacated_at: null, account_status: 'active' })
      toast.success('Tenant restored', 'Re-assign their property and unit from Edit.')
      load()
    } catch (e) { toast.error('Could not restore', e.message) }
  }

  const brandOpts = {
    brandName: profile?.brand_name || 'RentLoja',
    brandColor: profile?.brand_color || '#c8a84b',
    workspace: profile?.brand_name || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim(),
  }
  // Resend a receipt to the tenant over WhatsApp (matches the Payments page).
  const resendReceipt = (p) => {
    if (!tenant.phone) return toast.error('No phone number', 'Add a phone number to send on WhatsApp.')
    const msg = receiptMessage({ tenant, payment: p, manager: profile, periodLabel: formatPeriod({ from: p.period_from, to: p.period_to }) })
    sendWhatsApp(tenant.phone, msg)
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
            {/* Only while the tenant is still on the password you issued. Once
                they have chosen their own, there is no temp password to share —
                showing one would hand out a credential that no longer works, and
                issuing a fresh one would lock them out of the password they know.
                A tenant who forgets theirs uses "Forgot password?" themselves. */}
            {/* Deleted tenants are read-only "past residents": only the statement /
                receipts remain. Everything else is hidden. */}
            {!deletedAt && (<>
              {!vacatedAt && tenant.first_login && (
                <button className="btn ghost" onClick={resend}><IconKey size={15} /> Resend credentials</button>
              )}
              {!vacatedAt && <button className="btn ok" onClick={() => setRecording(true)}><IconWallet size={15} /> Record payment</button>}
              <button className="btn primary" onClick={() => setEditing(true)}><IconEdit size={15} /> Edit</button>
              {!vacatedAt
                ? <button className="btn ghost danger" onClick={() => setShowVacate(true)}>Vacate</button>
                : (<>
                    <button className="btn ghost" onClick={restore}>Restore</button>
                    <button className="btn ghost danger" onClick={() => { if (window.confirm(`Permanently delete ${fullName(tenant)}? Their login and record are removed, but their payment history stays in your Finances.`)) deleteNow() }}>Delete permanently</button>
                  </>)}
            </>)}
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

      {deletedAt ? (
        <div className="banner" style={{ marginBottom: 20 }}>
          <div className="b-ico"><IconClock size={18} /></div>
          <div><b>Past resident</b> — this tenant was deleted on {fmtDate(deletedAt)}. Their record is read-only, but their payment history is kept below for your records.</div>
        </div>
      ) : vacatedAt && (
        <div className="banner gold" style={{ marginBottom: 20 }}>
          <div className="b-ico"><IconClock size={18} /></div>
          <div>This tenant <b>vacated</b> on {fmtDate(vacatedAt)}. Their unit is freed and access is off, but the record and payment history are kept for reference — <b>Restore</b> them or <b>Delete permanently</b> above.</div>
        </div>
      )}

      <div className="grid stats" style={{ marginBottom: 24 }}>
        <StatCard label="Monthly rent" value={money(tenant.rent)} icon={<IconWallet size={18} />} />
        <StatCard label="Total paid" value={money(totalPaid)} sub={`${approved.length} payments`} />
        <StatCard label="Credit balance" value={money(credit)} sub={credit > 0 ? 'Carried forward' : '—'} />
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

      {showVacate && (
        <Modal title={`Vacate ${fullName(tenant)}`} onClose={() => setShowVacate(false)}
          footer={<button className="btn ghost" onClick={() => setShowVacate(false)}>Cancel</button>}>
          <p className="muted" style={{ marginTop: 0 }}>
            {fullName(tenant)} is moving out — their unit will be freed and their access turned off. Choose what happens to their record:
          </p>
          <div className="col" style={{ gap: 12 }}>
            <button className="card pad" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={vacate}>
              <div style={{ fontWeight: 600 }}>Keep the record (archive)</div>
              <div className="muted" style={{ fontSize: '0.85rem', marginTop: 3 }}>Keeps their details and full payment history for reference. You can delete it any time later.</div>
            </button>
            <button className="card pad" style={{ textAlign: 'left', cursor: 'pointer', borderColor: 'var(--danger)' }}
              onClick={() => { setShowVacate(false); deleteNow() }}>
              <div style={{ fontWeight: 600, color: 'var(--danger)' }}>Delete permanently now</div>
              <div className="muted" style={{ fontSize: '0.85rem', marginTop: 3 }}>Removes the tenant and their login. Their <b>payment history stays</b> in your Finances. This cannot be undone.</div>
            </button>
          </div>
        </Modal>
      )}
      {viewing && <ReceiptModal payment={viewing} tenant={tenant} manager={profile} property={property} onClose={() => setViewing(null)} onWhatsapp={() => resendReceipt(viewing)} />}
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
