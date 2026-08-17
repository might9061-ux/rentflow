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
import { IconPlus, IconEdit, IconKey, IconReceipt, IconTag, IconBuilding } from '../../components/icons.jsx'
import TenantModal from './TenantModal.jsx'
import CredentialsModal from './CredentialsModal.jsx'
import ChangeRoomModal from './ChangeRoomModal.jsx'

export default function Tenants() {
  const { userId, profile } = useAuth()
  const isOwner = profile?.role !== 'staff' // agents never see plan/subscription CTAs
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
  const [menuFor, setMenuFor] = useState(null) // tenant id whose ⋯ menu is open
  const [movingRoom, setMovingRoom] = useState(null) // tenant being moved to another room

  useEffect(() => {
    if (!menuFor) return
    const close = () => setMenuFor(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuFor])

  const load = async () => {
    const [t, p, m, pays] = await Promise.all([
      // The workspace OWNER's row carries the plan/capacity — an agent's own row
      // has no plan, which would wrongly show "choose a plan" and block adding.
      db.listTenants(userId), db.listProperties(userId), db.getWorkspaceManager(userId), db.listPayments(userId).catch(() => []),
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

      {atCapacity && (isOwner ? (
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
      ) : (
        // Agents don't manage the plan — never show them a subscription CTA.
        <div className="banner gold"><div className="b-ico"><IconTag size={18} /></div>
          <div>This workspace has reached its tenant capacity. Ask the account owner to upgrade the plan.</div>
        </div>
      ))}

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
                      {/* Actions live behind a ⋯ menu to keep rows clean (the
                          temp key only appears until they set their own password). */}
                      <div className="row" style={{ justifyContent: 'flex-end', position: 'relative' }}>
                        <button className="btn sm ghost" title="More" aria-label="More actions"
                          onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === t.id ? null : t.id) }}>⋯</button>
                        {menuFor === t.id && (
                          <div className="tn-menu" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => { setMenuFor(null); nav(`/manager/tenants/${t.id}`) }}><IconReceipt size={13} /> Payment history</button>
                            <button onClick={() => { setMenuFor(null); setEditing(t) }}><IconEdit size={13} /> Edit</button>
                            {t.property_id && (
                              <button onClick={() => { setMenuFor(null); setMovingRoom(t) }}><IconBuilding size={13} /> Change room</button>
                            )}
                            {t.first_login && (
                              <button onClick={() => { setMenuFor(null); resend(t) }}><IconKey size={13} /> Resend credentials</button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <style>{`
        .tn-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; min-width: 186px;
          background: var(--surface); border: 1px solid var(--line); border-radius: 10px;
          box-shadow: 0 10px 28px -12px rgba(13,27,46,0.35); padding: 5px; }
        .tn-menu button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 11px;
          background: none; border: none; border-radius: 7px; color: var(--text); font-size: 0.86rem;
          cursor: pointer; text-align: left; }
        .tn-menu button:hover { background: var(--accent-bg); }
      `}</style>

      {editing && (
        <TenantModal tenant={editing} properties={properties} tenants={tenants} userId={userId}
          onClose={() => setEditing(null)}
          onCreated={(created, tempPassword) => { setEditing(null); setCreds({ tenant: created, tempPassword }); load() }}
          onUpdated={() => { setEditing(null); load() }} />
      )}

      {creds && <CredentialsModal tenant={creds.tenant} tempPassword={creds.tempPassword} onClose={() => setCreds(null)} />}

      {movingRoom && (
        <ChangeRoomModal tenant={movingRoom} userId={userId}
          onClose={() => setMovingRoom(null)}
          onSaved={() => { setMovingRoom(null); load() }} />
      )}
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
