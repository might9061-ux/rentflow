import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { money, fullName } from '../../lib/format.js'
import { currentPeriod, formatPeriod } from '../../lib/billing.js'
import { downloadCSV } from '../../lib/csv.js'
import { capacityFor } from '../../lib/pricing.js'
import { tenantLedger, tenantTotalPaid } from '../../lib/ledger.js'
import { StatusPill, PeriodTag, Spinner, EmptyState } from '../../components/ui.jsx'
import { IconPlus, IconEdit, IconKey, IconReceipt, IconTag } from '../../components/icons.jsx'
import TenantModal from './TenantModal.jsx'
import CredentialsModal from './CredentialsModal.jsx'

export default function Tenants() {
  const { userId } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [tenants, setTenants] = useState([])
  const [properties, setProperties] = useState([])
  const [manager, setManager] = useState(null)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)
  const [creds, setCreds] = useState(null) // { tenant, tempPassword }
  const [showPast, setShowPast] = useState(false) // active vs vacated tenants

  const load = async () => {
    const [t, p, m, pays] = await Promise.all([
      db.listTenants(userId), db.listProperties(userId), db.getManager(userId), db.listPayments(userId).catch(() => []),
    ])
    // Overlay derived status + credit + total from the actual payments, so the
    // list and CSV always reflect real payment data rather than the stored
    // snapshot (which can drift and disagree with the dashboard).
    const withDerived = t.map((x) => {
      const led = tenantLedger(x, pays)
      return { ...x, status: led.currentStatus, credit_balance: led.creditAdvance, total_paid: tenantTotalPaid(x, pays) }
    })
    setTenants(withDerived); setProperties(p); setManager(m); setLoading(false)
  }
  useEffect(() => { load() }, [userId])

  // Deleted tenants are hidden everywhere (their payments stay in Finances).
  // Vacated ones are archived — kept for reference but out of the active roster.
  const visible = tenants.filter((t) => !t.deleted_at)
  const active = visible.filter((t) => !t.vacated_at)
  const past = visible.filter((t) => t.vacated_at)
  // Plan capacity: block adding tenants once the plan (or free allowance) is full.
  const cap = manager ? capacityFor(manager) : Infinity
  const atCapacity = !!manager && active.length >= cap

  const propName = (id) => properties.find((p) => p.id === id)?.name || '—'

  const resend = async (t) => {
    // Only warn once they've set their own password — before that it's just the
    // initial temp-password handover, with no real password to disrupt.
    if (!t.first_login && !window.confirm(`Reset ${fullName(t)}'s password?\n\nThey've already set their own — this replaces it with a new temporary one, so their current password stops working and you'll need to send them the new one.`)) return
    const { tempPassword } = await db.resendCredentials(t.id)
    toast.success('New credentials generated')
    setCreds({ tenant: t, tempPassword })
    load()
  }

  const base = showPast ? past : active
  const filtered = base.filter((t) => {
    const q = query.toLowerCase()
    return !q || fullName(t).toLowerCase().includes(q) || t.email.toLowerCase().includes(q) || (t.unit || '').toLowerCase().includes(q)
  })

  return (
    <div className="page">
      <div className="spread page-head">
        <div>
          <div className="eyebrow">People</div>
          <h1>Tenants</h1>
          <p>Everyone renting across your properties.</p>
        </div>
        <div className="row gap">
          <button className="btn ghost" disabled={base.length === 0}
            onClick={() => exportTenantsCsv(base, (id) => propName(id))}>
            <IconReceipt size={15} /> Export CSV
          </button>
          <button className="btn primary" onClick={() => setEditing({})} disabled={properties.length === 0 || atCapacity}>
            <IconPlus size={16} /> Add tenant
          </button>
        </div>
      </div>

      {properties.length === 0 && !loading && (
        <div className="banner gold"><div className="b-ico"><IconKey size={18} /></div>
          <div>Add a property first, then you can assign tenants to its units.</div></div>
      )}

      {atCapacity && (
        <div className="banner gold"><div className="b-ico"><IconTag size={18} /></div>
          <div className="spread grow wrap" style={{ gap: 10 }}>
            <span>
              {manager.plan_active
                ? `You’ve reached your plan capacity (${active.length}/${cap} tenants). Upgrade to add more.`
                : `You need an active plan to add tenants. Subscribe and pay your installment to get started.`}
            </span>
            <Link to="/manager/plan" className="btn primary sm">{manager.plan_active ? 'Upgrade plan' : 'Choose a plan'}</Link>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16, padding: 12 }}>
        <div className="row gap wrap" style={{ alignItems: 'center' }}>
          <input className="input grow" placeholder="Search by name, email or unit…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ minWidth: 200 }} />
          {past.length > 0 && (
            <div className="seg">
              <button className={!showPast ? 'on' : ''} onClick={() => setShowPast(false)}>Active ({active.length})</button>
              <button className={showPast ? 'on' : ''} onClick={() => setShowPast(true)}>Past ({past.length})</button>
            </div>
          )}
        </div>
      </div>

      {loading ? <div className="center" style={{ minHeight: 200 }}><Spinner /></div>
        : filtered.length === 0 ? (
          <div className="card"><EmptyState icon="👤" title="No tenants found">{query ? 'Try a different search.' : showPast ? 'No past (vacated) tenants.' : 'Add your first tenant to get started.'}</EmptyState></div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Tenant</th><th>Property / Unit</th><th>Rent</th><th>Billing period</th>
                  <th>Status</th><th>Credit</th><th>Account</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="clickable-row" onClick={() => nav(`/manager/tenants/${t.id}`)}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{fullName(t)}</div>
                      <div className="muted" style={{ fontSize: '0.8rem' }}>{t.email}</div>
                    </td>
                    <td>
                      <div>{propName(t.property_id)}</div>
                      <div className="muted" style={{ fontSize: '0.8rem' }}>Unit {t.unit || '—'}</div>
                    </td>
                    <td className="mono">{money(t.rent)}</td>
                    <td><PeriodTag period={currentPeriod(t.due_day)} /></td>
                    <td><StatusPill status={t.status} /></td>
                    <td className="mono" style={{ color: t.credit_balance > 0 ? 'var(--green)' : 'var(--text-faint)' }}>
                      {money(t.credit_balance)}
                    </td>
                    <td><StatusPill status={t.account_status} /></td>
                    <td>
                      <div className="row gap" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn sm ghost" title="Payment history" onClick={(e) => { e.stopPropagation(); nav(`/manager/tenants/${t.id}`) }}><IconReceipt size={14} /></button>
                        <button className="btn sm ghost" title="Edit" onClick={(e) => { e.stopPropagation(); setEditing(t) }}><IconEdit size={14} /></button>
                        <button className="btn sm ghost" title={t.first_login ? 'Resend credentials' : 'Reset password'} onClick={(e) => { e.stopPropagation(); resend(t) }}><IconKey size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {editing && (
        <TenantModal tenant={editing} properties={properties} tenants={tenants} userId={userId}
          onClose={() => setEditing(null)}
          onCreated={(created, tempPassword) => { setEditing(null); setCreds({ tenant: created, tempPassword }); load() }}
          onUpdated={() => { setEditing(null); load() }} />
      )}

      {creds && <CredentialsModal tenant={creds.tenant} tempPassword={creds.tempPassword} onClose={() => setCreds(null)} />}
    </div>
  )
}

function exportTenantsCsv(tenants, propName) {
  downloadCSV(`rentflow-tenants-${new Date().toISOString().slice(0, 10)}.csv`, tenants, [
    { header: 'Name', value: (t) => fullName(t) },
    { header: 'Email', value: (t) => t.email },
    { header: 'Phone', value: (t) => t.phone || '' },
    { header: 'Property', value: (t) => propName(t.property_id) },
    { header: 'Unit', value: (t) => t.unit || '' },
    { header: 'Rent (USD)', value: (t) => Number(t.rent).toFixed(2) },
    { header: 'Billing period', value: (t) => formatPeriod(currentPeriod(t.due_day)) },
    { header: 'Status', value: (t) => t.status },
    { header: 'Credit (USD)', value: (t) => Number(t.credit_balance).toFixed(2) },
    { header: 'Account', value: (t) => t.account_status },
    { header: 'Lease start', value: (t) => t.lease_start || '' },
    { header: 'Lease end', value: (t) => t.lease_end || '' },
  ])
}
