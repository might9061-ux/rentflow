import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { db } from '../../lib/db.js'
import { money, fullName, fmtDate } from '../../lib/format.js'
import { StatCard, StatusPill, Spinner, EmptyState, PeriodTag } from '../../components/ui.jsx'
import { DonutChart } from '../../components/Charts.jsx'
import { collectionBreakdown } from '../../lib/arrears.js'
import {
  IconWallet, IconClock, IconBuilding, IconCheckCircle, IconArrowRight,
} from '../../components/icons.jsx'

const FRAMES = [{ label: '3M', v: 3 }, { label: '6M', v: 6 }, { label: '12M', v: 12 }, { label: 'All', v: 'all' }]

// Collected rent vs not-yet-paid for a chosen window — summed across active
// tenants using one consistent per-month coverage model (see arrears.js).
function collectionStats(payments, tenants, frame) {
  return tenants
    .filter((t) => t.account_status === 'active')
    .reduce((acc, t) => {
      const b = collectionBreakdown(t, payments, frame)
      acc.collected += b.collected
      acc.notPaid += b.notPaid
      return acc
    }, { collected: 0, notPaid: 0 })
}

export default function ManagerDashboard() {
  const { userId, profile } = useAuth()
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [frame, setFrame] = useState(6)

  const load = useCallback(async () => {
    const [props, tenants, payments] = await Promise.all([
      db.listProperties(userId), db.listTenants(userId), db.listPayments(userId),
    ])
    const approved = payments.filter((p) => p.status === 'approved')
    const pending = payments.filter((p) => p.status === 'pending')
    const collected = approved.reduce((s, p) => s + Number(p.amount), 0)
    const outstanding = tenants
      .filter((t) => t.status !== 'paid' && t.account_status === 'active')
      .reduce((s, t) => s + Math.max(0, Number(t.rent) - Number(t.credit_balance)), 0)
    const totalUnits = props.reduce((s, p) => s + Number(p.units || 0), 0)
    const occupied = tenants.filter((t) => t.property_id && t.account_status !== 'suspended').length
    const occupancy = totalUnits ? Math.round((occupied / totalUnits) * 100) : 0

    setData({ props, tenants, payments, approved, pending, collected, outstanding, occupancy, occupied, totalUnits })
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="page center" style={{ minHeight: 320 }}><Spinner /></div>

  const tenantName = (id) => fullName(data.tenants.find((t) => t.id === id))
  const cs = collectionStats(data.payments, data.tenants, frame)
  const frameLabel = frame === 'all' ? 'All time' : `Last ${frame} months`

  return (
    <div className="page">
      <div className="page-head">
        <div className="eyebrow">Overview</div>
        <h1>Good day, {profile?.first_name}</h1>
        <p>Here’s how your portfolio is doing today.</p>
      </div>

      <div className="grid stats" style={{ marginBottom: 20 }}>
        <StatCard label="Total collected" value={money(data.collected)} sub={`${data.approved.length} approved payments`} icon={<IconWallet size={18} />} onClick={() => nav('/manager/payments')} />
        <StatCard label="Outstanding" value={money(data.outstanding)} sub="Across unpaid tenants" icon={<IconClock size={18} />} onClick={() => nav('/manager/tenants')} />
        <StatCard label="Occupancy" value={`${data.occupancy}%`} sub={`${data.occupied} of ${data.totalUnits} units`} icon={<IconBuilding size={18} />} onClick={() => nav('/manager/properties')} />
        <StatCard label="Pending approvals" value={data.pending.length} sub="Awaiting your review" icon={<IconCheckCircle size={18} />} onClick={() => nav('/manager/approvals')} />
      </div>

      {/* Rent collection donut */}
      <div className="card pad" style={{ marginBottom: 20 }}>
        <div className="spread wrap" style={{ marginBottom: 16, gap: 12 }}>
          <div>
            <h3>Rent collection</h3>
            <p className="muted" style={{ fontSize: '0.84rem' }}>{frameLabel} · {data.pending.length} pending</p>
          </div>
          <div className="seg">
            {FRAMES.map((f) => (
              <button key={f.v} className={frame === f.v ? 'on' : ''} onClick={() => setFrame(f.v)}>{f.label}</button>
            ))}
          </div>
        </div>
        <DonutChart
          centerValue={money(cs.collected)} centerLabel="Collected"
          segments={[
            { label: 'Collected rent', value: cs.collected, color: 'var(--green)' },
            { label: 'Not yet paid', value: cs.notPaid, color: '#d98b5f' },
          ]} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}>
        {/* Pending approvals */}
        <div className="card">
          <div className="spread" style={{ padding: '18px 20px 12px' }}>
            <h3>Pending approvals</h3>
            <Link to="/manager/approvals" className="btn ghost sm">Review all <IconArrowRight size={14} /></Link>
          </div>
          <div className="divider" style={{ margin: 0 }} />
          {data.pending.length === 0 ? (
            <EmptyState icon="✓" title="Nothing pending">All caught up.</EmptyState>
          ) : (
            <div style={{ padding: '6px 8px' }}>
              {data.pending.slice(0, 5).map((p) => (
                <div key={p.id} className="spread list-row clickable" style={{ padding: '12px' }} onClick={() => nav('/manager/approvals')}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{tenantName(p.tenant_id)}</div>
                    <div className="muted" style={{ fontSize: '0.82rem' }}>{p.method} · {fmtDate(p.paid_date)}</div>
                  </div>
                  <div className="row gap">
                    <span className="mono" style={{ fontWeight: 600 }}>{money(p.amount)}</span>
                    <StatusPill status="pending" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent payments */}
        <div className="card">
          <div className="spread" style={{ padding: '18px 20px 12px' }}>
            <h3>Recent payments</h3>
            <Link to="/manager/payments" className="btn ghost sm">View all <IconArrowRight size={14} /></Link>
          </div>
          <div className="divider" style={{ margin: 0 }} />
          {data.approved.length === 0 ? (
            <EmptyState icon="◌" title="No payments yet" />
          ) : (
            <div style={{ padding: '6px 8px' }}>
              {data.approved.slice(0, 5).map((p) => (
                <div key={p.id} className="list-row clickable" style={{ padding: '12px' }} onClick={() => nav('/manager/payments')}>
                  <div className="spread">
                    <div style={{ fontWeight: 600 }}>{tenantName(p.tenant_id)}</div>
                    <span className="mono" style={{ fontWeight: 600, color: 'var(--gold)' }}>{money(p.amount)}</span>
                  </div>
                  <div style={{ marginTop: 5 }}><PeriodTag from={p.period_from} to={p.period_to} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
