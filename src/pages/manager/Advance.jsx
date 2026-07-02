import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { db } from '../../lib/db.js'
import { money, fullName, monthYear } from '../../lib/format.js'
import { computeAdvance } from '../../lib/arrears.js'
import { StatCard, Spinner, EmptyState } from '../../components/ui.jsx'
import { IconSparkle, IconUsers, IconWallet, IconClock } from '../../components/icons.jsx'
import { prettyPhone } from '../../lib/phone.js'

export default function Advance() {
  const { userId } = useAuth()
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [tenants, setTenants] = useState([])
  const [properties, setProperties] = useState([])

  const load = useCallback(async () => {
    const [t, p] = await Promise.all([db.listTenants(userId), db.listProperties(userId)])
    setTenants(t); setProperties(p); setLoading(false)
  }, [userId])
  useEffect(() => { load() }, [load])

  if (loading) return <div className="center" style={{ minHeight: 200 }}><Spinner /></div>

  const propName = (id) => properties.find((p) => p.id === id)?.name || '—'

  // Tenants who are paid up AND carrying credit toward future months.
  const ahead = tenants
    .filter((t) => t.account_status === 'active' && t.status === 'paid')
    .map((t) => ({ t, adv: computeAdvance(t) }))
    .filter((x) => x.adv.hasAdvance)
    .sort((a, b) => b.adv.credit - a.adv.credit)

  const totalPrepaid = ahead.reduce((s, x) => s + x.adv.credit, 0)
  const avgMonths = ahead.length
    ? (ahead.reduce((s, x) => s + x.adv.fullMonths + x.adv.partialPct / 100, 0) / ahead.length)
    : 0

  return (
    <>
      <p className="muted" style={{ marginTop: -6, marginBottom: 20 }}>
        Tenants who’ve paid ahead — how many months their credit covers, and the month it partially covers.
      </p>

      <div className="grid stats" style={{ marginBottom: 24 }}>
        <StatCard label="Total prepaid" value={money(totalPrepaid)} sub="Credit on file" icon={<IconWallet size={18} />} />
        <StatCard label="Paying ahead" value={ahead.length} sub={`Active tenant${ahead.length === 1 ? '' : 's'}`} icon={<IconUsers size={18} />} />
        <StatCard label="Avg coverage" value={`${avgMonths.toFixed(1)} mo`} sub="Beyond this month" icon={<IconClock size={18} />} />
      </div>

      {ahead.length === 0 ? (
        <div className="card"><EmptyState icon="💳" title="No advance payments">No tenant is currently paid ahead.</EmptyState></div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Tenant</th><th>Property / Unit</th><th>Monthly rent</th><th>Paid ahead</th><th>Covers</th><th>Covered through</th><th>Partial month</th></tr>
            </thead>
            <tbody>
              {ahead.map(({ t, adv }) => (
                <tr key={t.id} className="clickable-row" onClick={() => nav(`/manager/tenants/${t.id}`)}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{fullName(t)}</div>
                    <div className="muted" style={{ fontSize: '0.8rem' }}>{prettyPhone(t.phone)}</div>
                  </td>
                  <td>
                    <div>{propName(t.property_id)}</div>
                    <div className="muted" style={{ fontSize: '0.8rem' }}>Unit {t.unit || '—'}</div>
                  </td>
                  <td className="mono">{money(t.rent)}</td>
                  <td className="mono" style={{ fontWeight: 700, color: 'var(--ok, var(--accent))' }}>{money(adv.credit)}</td>
                  <td>
                    <span className="pill ok"><IconSparkle size={12} /> {adv.monthsCovered} mo</span>
                  </td>
                  <td>{monthYear(adv.coveredThrough)}</td>
                  <td>
                    {adv.partialMonth
                      ? <span className="muted">{money(adv.partialAmount)} ({adv.partialPct}%) · {monthYear(adv.partialMonth)}</span>
                      : <span className="muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
