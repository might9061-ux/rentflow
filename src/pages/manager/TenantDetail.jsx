import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { money, fullName, fmtDate } from '../../lib/format.js'
import { prettyPhone } from '../../lib/phone.js'
import { StatusPill, Spinner, EmptyState } from '../../components/ui.jsx'
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
import LeaseModal from './LeaseModal.jsx'
import { printLease, leaseTermLabel } from '../../lib/leaseDoc.js'

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
  const [stmtOpen, setStmtOpen] = useState(false) // ⋯ menu (statement, credentials, vacate…)
  const [showVacate, setShowVacate] = useState(false)
  const [leases, setLeases] = useState([])
  const [leaseModal, setLeaseModal] = useState(false)
  const [confirmDelLease, setConfirmDelLease] = useState(null)

  const load = async () => {
    const [t, pays, props, lz] = await Promise.all([
      db.getTenant(id), db.listTenantPayments(id), db.listProperties(userId), db.listLeases(userId, id).catch(() => []),
    ])
    setTenant(t); setPayments(pays); setProperties(props); setLeases(lz); setLoading(false)
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
    // Only warn once they've set their own password — before that it's just the
    // initial temp-password handover, with no real password to disrupt.
    if (!tenant.first_login && !window.confirm(`Reset ${fullName(tenant)}'s password?\n\nThey've already set their own — this replaces it with a new temporary one, so their current password stops working and you'll need to send them the new one.`)) return
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
    brandColor: profile?.brand_color || '#1d6fe0',
    workspace: profile?.brand_name || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim(),
  }
  // Resend a receipt to the tenant over WhatsApp (matches the Payments page).
  const resendReceipt = (p) => {
    if (!tenant.phone) return toast.error('No phone number', 'Add a phone number to send on WhatsApp.')
    const msg = receiptMessage({ tenant, payment: p, manager: profile, periodLabel: formatPeriod({ from: p.period_from, to: p.period_to }) })
    sendWhatsApp(tenant.phone, msg)
  }

  // View a lease: uploaded → open the file; generated → print/PDF the document.
  const viewLease = (l) => {
    if (l.kind === 'uploaded' && l.document_url) window.open(l.document_url, '_blank')
    else printLease({ lease: l, tenant, manager: profile, property })
  }
  const confirmDeleteLease = async () => {
    const l = confirmDelLease
    try { await db.deleteLease(l.id); toast.success('Lease deleted'); setConfirmDelLease(null); load() }
    catch (e) { toast.error('Could not delete', e.message) }
  }
  const signAsLandlord = async (l) => {
    try {
      await db.updateLease(l.id, { manager_signed_name: fullName(profile), manager_signed_at: new Date().toISOString() })
      toast.success('Signed as landlord'); load()
    } catch (e) { toast.error('Could not sign', e.message) }
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
          {/* Executive toolbar: the two everyday actions stay visible; statement,
              credentials and the archive actions live behind ⋯. Deleted tenants
              are read-only, so only the statement remains in the menu. */}
          <div className="row gap wrap" style={{ position: 'relative' }}>
            {!deletedAt && !vacatedAt && <button className="btn ok" onClick={() => setRecording(true)}><IconWallet size={15} /> Record payment</button>}
            {!deletedAt && <button className="btn primary" onClick={() => setEditing(true)}><IconEdit size={15} /> Edit</button>}
            <button className="btn ghost" aria-label="More actions" onClick={(e) => { e.stopPropagation(); setStmtOpen((o) => !o) }}>⋯</button>
            {stmtOpen && (
              <>
                <div className="stmt-back" onClick={() => setStmtOpen(false)} />
                <div className="stmt-menu">
                  <button onClick={printPdf}><IconReceipt size={15} /> Print statement / PDF</button>
                  <button onClick={downloadCsv}><IconDownload size={15} /> Download CSV (Excel)</button>
                  {!deletedAt && !vacatedAt && tenant.first_login && (
                    <button onClick={() => { setStmtOpen(false); resend() }}><IconKey size={15} /> Resend credentials</button>
                  )}
                  {!deletedAt && !vacatedAt && (
                    <button className="danger" onClick={() => { setStmtOpen(false); setShowVacate(true) }}>Vacate</button>
                  )}
                  {!deletedAt && vacatedAt && (<>
                    <button onClick={() => { setStmtOpen(false); restore() }}>Restore</button>
                    <button className="danger" onClick={() => { setStmtOpen(false); if (window.confirm(`Permanently delete ${fullName(tenant)}? Their login and record are removed, but their payment history stays in your Finances.`)) deleteNow() }}>Delete permanently</button>
                  </>)}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="row gap wrap" style={{ marginTop: 16 }}>
          <span className="pill neutral">{property?.name || 'Unassigned'} · Unit {tenant.unit || '—'}</span>
          <StatusPill status={led.currentStatus} />
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

      {/* Compact KPI strip — three cells side by side at every width. */}
      <div className="td-kpis" style={{ marginBottom: 24 }}>
        <div><span className="tk-l">Monthly rent</span><span className="tk-v">{money(tenant.rent)}</span><span className="tk-s">due day {tenant.due_day}</span></div>
        <div><span className="tk-l">Total paid</span><span className="tk-v" style={{ color: totalPaid > 0 ? 'var(--green)' : undefined }}>{money(totalPaid)}</span><span className="tk-s">{approved.length} payments</span></div>
        <div><span className="tk-l">Credit</span><span className="tk-v" style={{ color: credit > 0 ? 'var(--green)' : undefined }}>{money(credit)}</span><span className="tk-s">{credit > 0 ? 'carried forward' : 'none'}</span></div>
      </div>

      {!deletedAt && (
        <div className="card pad" style={{ marginBottom: 24 }}>
          <div className="spread">
            <h3 style={{ margin: 0 }}>Lease agreement</h3>
            {!vacatedAt && <button className="btn sm ok" onClick={() => setLeaseModal(true)}><IconReceipt size={14} /> {leases.length ? 'New lease' : 'Create lease'}</button>}
          </div>
          {leases.length === 0 ? (
            <p className="muted" style={{ fontSize: '.86rem', margin: '10px 0 0' }}>No lease yet. Create one to send to {tenant.first_name} to view and sign.</p>
          ) : (
            <div className="col" style={{ gap: 0, marginTop: 6 }}>
              {leases.map((l) => (
                <div key={l.id} className="spread wrap" style={{ padding: '11px 0', borderTop: '1px solid var(--line)', gap: 10 }}>
                  <div>
                    <div className="row gap">
                      <b>{l.kind === 'uploaded' ? (l.file_name || 'Uploaded lease') : 'Lease agreement'}</b>
                      <span className={`pill ${l.status === 'signed' ? 'green' : ''}`}>
                        {l.status === 'signed' ? 'Signed' : l.status === 'sent' ? 'Awaiting signature' : 'Draft'}
                      </span>
                    </div>
                    <div className="muted" style={{ fontSize: '.8rem' }}>
                      {l.kind === 'uploaded' ? 'Uploaded document' : leaseTermLabel(l)}
                      {l.manager_signed_name ? ' · Landlord signed' : ' · Not signed by you'}
                      {l.status === 'signed' && ` · Tenant signed ${fmtDate(l.signed_at)}`}
                    </div>
                  </div>
                  <div className="row gap">
                    {!l.manager_signed_name && <button className="btn sm ghost" onClick={() => signAsLandlord(l)}>Sign</button>}
                    <button className="btn sm ghost" onClick={() => viewLease(l)}>View</button>
                    <button className="btn sm ghost danger" onClick={() => setConfirmDelLease(l)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <h3 style={{ marginBottom: 12 }}>Payment history</h3>
      {payments.length === 0 ? (
        <div className="card"><EmptyState icon="🧾" title="No payments yet" /></div>
      ) : (
        /* Executive rows — approved rows open their receipt. */
        <div className="card">
          {payments.map((p) => {
            const dot = p.status === 'approved' ? 'var(--green)' : p.status === 'rejected' ? 'var(--danger)' : 'var(--warn)'
            const open = p.status === 'approved' ? () => setViewing(p) : undefined
            return (
              <div key={p.id} className={`td-row ${open ? 'click' : ''}`} role={open ? 'button' : undefined} tabIndex={open ? 0 : undefined}
                onClick={open} onKeyDown={open ? (e) => { if (e.key === 'Enter') open() } : undefined}>
                <span className="td-dot" style={{ background: dot }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="mono" style={{ fontWeight: 700, color: p.status === 'approved' ? 'var(--green)' : 'var(--text)' }}>{money(p.amount)}</span>
                  <span className="muted"> · {p.method}</span>
                  <div className="muted td-sub">
                    {fmtDate(p.paid_date)} · {formatPeriod({ from: p.period_from, to: p.period_to })}{p.receipt_no ? ` · ${p.receipt_no}` : ''}
                  </div>
                </div>
                <StatusPill status={p.status} />
                {open && <span style={{ color: 'var(--accent)', display: 'inline-flex' }}><IconReceipt size={15} /></span>}
              </div>
            )
          })}
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
      {leaseModal && (
        <LeaseModal tenant={tenant} property={property} manager={profile}
          onClose={() => setLeaseModal(false)} onSaved={() => { setLeaseModal(false); load() }} />
      )}
      {confirmDelLease && (
        <Modal title="Delete this lease?" onClose={() => setConfirmDelLease(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setConfirmDelLease(null)}>Cancel</button>
            <button className="btn primary danger" onClick={confirmDeleteLease}>Delete lease</button>
          </>}>
          <p className="muted" style={{ marginTop: 0 }}>
            This permanently removes the {confirmDelLease.kind === 'uploaded' ? 'uploaded lease' : 'lease agreement'} for {fullName(tenant)}
            {confirmDelLease.status === 'signed' ? ', including the signed copy' : ''}. This cannot be undone.
          </p>
        </Modal>
      )}
      {viewing && <ReceiptModal payment={viewing} tenant={tenant} manager={profile} property={property} payments={payments} onClose={() => setViewing(null)} onWhatsapp={() => resendReceipt(viewing)} />}
      {editing && (
        <TenantModal tenant={tenant} properties={properties} userId={userId}
          onClose={() => setEditing(false)} onUpdated={() => { setEditing(false); load() }} onCreated={() => {}} />
      )}
      {creds && <CredentialsModal tenant={creds.tenant} tempPassword={creds.tempPassword} onClose={() => setCreds(null)} />}
      {recording && (
        <RecordPaymentModal tenant={tenant} payments={payments}
          onClose={() => setRecording(false)}
          onRecorded={(p) => { setRecording(false); load(); if (p) setViewing(p) }} />
      )}

      <style>{`
        .stmt-back { position: fixed; inset: 0; z-index: 40; }
        .stmt-menu { position: absolute; top: calc(100% + 6px); right: 0; z-index: 41; min-width: 220px;
          background: var(--surface); border: 1px solid var(--line); border-radius: 10px;
          box-shadow: 0 10px 28px -12px rgba(13,27,46,0.35); padding: 5px; }
        .stmt-menu button { display: flex; align-items: center; gap: 9px; width: 100%; text-align: left;
          background: transparent; border: none; color: var(--text); padding: 10px 11px; border-radius: 7px;
          font-size: 0.88rem; cursor: pointer; }
        .stmt-menu button:hover { background: var(--accent-bg); }
        .stmt-menu button.danger { color: var(--danger); }
        .td-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px;
          background: var(--line-soft); border: 1px solid var(--line-soft); border-radius: var(--radius); overflow: hidden; }
        .td-kpis > div { background: var(--surface); padding: 12px 16px; }
        .tk-l { display: block; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-dim); }
        .tk-v { display: block; font-family: var(--serif); font-size: 1.35rem; font-weight: 600; margin-top: 3px; }
        .tk-s { display: block; font-size: 0.74rem; color: var(--text-faint); margin-top: 2px; }
        @media (max-width: 480px) { .tk-v { font-size: 1.1rem; } }
        .td-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px;
          border-bottom: 1px solid var(--line-soft); transition: background 0.13s; }
        .td-row:last-of-type { border-bottom: none; }
        .td-row.click { cursor: pointer; }
        .td-row.click:hover { background: var(--accent-bg); }
        .td-row.click:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--accent); }
        .td-dot { width: 9px; height: 9px; border-radius: 99px; flex-shrink: 0; }
        .td-sub { font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      `}</style>
    </div>
  )
}
