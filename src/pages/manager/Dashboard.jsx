import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { db } from '../../lib/db.js'
import { money, fullName, fmtDate } from '../../lib/format.js'
import { StatCard, StatusPill, Spinner, EmptyState, PeriodTag } from '../../components/ui.jsx'
import { DonutChart } from '../../components/Charts.jsx'
import { tenantLedger } from '../../lib/ledger.js'
import { subscriptionStatus } from '../../lib/subscription.js'
import {
  IconWallet, IconClock, IconBuilding, IconCheckCircle, IconArrowRight,
} from '../../components/icons.jsx'

const FRAMES = [
  { label: 'This month', v: 'month' },
  { label: '3M', v: 3 }, { label: '6M', v: 6 }, { label: '12M', v: 12 }, { label: 'All', v: 'all' },
]

// Actual money collected in a window — approved payments by when they were paid.
// "All" equals the Total collected stat; shorter frames are a subset of it.
function collectedInFrame(approved, frame) {
  if (frame === 'all') return approved.reduce((s, p) => s + Number(p.amount || 0), 0)
  const now = new Date()
  const start = frame === 'month'
    ? new Date(now.getFullYear(), now.getMonth(), 1)
    : new Date(now.getFullYear(), now.getMonth() - (frame - 1), 1)
  return approved
    .filter((p) => new Date(p.paid_date || p.approved_at || p.created_at) >= start)
    .reduce((s, p) => s + Number(p.amount || 0), 0)
}

export default function ManagerDashboard() {
  const { userId, profile } = useAuth()
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [frame, setFrame] = useState('all')

  const load = useCallback(async () => {
    const [props, tenants, payments, openRepairs, dueReminders, wm, subPays] = await Promise.all([
      db.listProperties(userId), db.listTenants(userId), db.listPayments(userId),
      db.maintenanceOpenCount(userId).catch(() => 0),
      db.dueRemindersCount(userId).catch(() => 0),
      db.getWorkspaceManager(userId).catch(() => null),
      db.listSubscriptionPayments(userId).catch(() => []),
    ])
    const approved = payments.filter((p) => p.status === 'approved')
    const pending = payments.filter((p) => p.status === 'pending')
    const collected = approved.reduce((s, p) => s + Number(p.amount), 0)
    // Everything owed is read from the ledger, never the stored status — so a
    // status that drifted from the payment rows can't hide or invent a debt.
    const ledgers = tenants
      .filter((t) => t.account_status === 'active')
      .map((t) => ({ t, led: tenantLedger(t, payments) }))
    // Amount owed = the ledger's real balance per tenant (overdue + what's left
    // this month), so a PARTIAL payment reduces it. Using rent − advance-credit
    // ignored partial payments and overstated the outstanding total.
    const outstanding = ledgers.reduce((s, x) => s + x.led.totalOwed, 0)
    // Only tenants genuinely LATE (a past month isn't fully covered), not those
    // merely in an unpaid current month ('due') — that isn't "overdue" yet.
    const overdue = ledgers.filter((x) => x.led.currentStatus === 'overdue')
    const totalUnits = props.reduce((s, p) => s + Number(p.units || 0), 0)
    const occupied = tenants.filter((t) => t.property_id && t.account_status !== 'suspended').length
    const occupancy = totalUnits ? Math.round((occupied / totalUnits) * 100) : 0

    setData({
      props, tenants, payments, approved, pending, collected, outstanding,
      occupancy, occupied, totalUnits, overdue: overdue.length, openRepairs, dueReminders,
      sub: subscriptionStatus(wm, subPays),
    })
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="page center" style={{ minHeight: 320 }}><Spinner /></div>

  const tenantName = (id) => fullName(data.tenants.find((t) => t.id === id))
  const collected = collectedInFrame(data.approved, frame)
  const frameLabel = frame === 'all' ? 'All time' : frame === 'month' ? 'This month' : `Last ${frame} months`

  return (
    <div className="page">
      <div className="page-head">
        <div className="eyebrow">Overview</div>
        <h1>Good day, {profile?.first_name}</h1>
        <p>Here’s how your portfolio is doing today.</p>
      </div>

      {/* Automatic reminder when the manager's own subscription is due/overdue. */}
      {data.sub && (data.sub.state === 'overdue' || data.sub.state === 'due-soon') && (
        <Link to="/manager/plan" className="banner gold" style={{ marginBottom: 18, textDecoration: 'none', display: 'flex' }}>
          <div className="b-ico"><IconWallet size={18} /></div>
          <div className="spread" style={{ flex: 1, alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: '0.9rem' }}>
              <b>{data.sub.state === 'overdue' ? 'Subscription overdue' : 'Subscription due soon'}</b> — your {money(data.sub.price)} installment is {data.sub.state === 'overdue'
                ? `${Math.abs(data.sub.days)} day${Math.abs(data.sub.days) === 1 ? '' : 's'} overdue`
                : (data.sub.days <= 0 ? 'due today' : `due in ${data.sub.days} day${data.sub.days === 1 ? '' : 's'}`)}.
            </div>
            <span className="btn primary sm" style={{ whiteSpace: 'nowrap' }}>Pay now <IconArrowRight size={14} /></span>
          </div>
        </Link>
      )}

      <AttentionBar data={data} nav={nav} />

      <div className="grid stats" style={{ marginBottom: 20 }}>
        <StatCard label="Total collected" value={money(data.collected)} sub={`${data.approved.length} approved payments`} icon={<IconWallet size={18} />} onClick={() => nav('/manager/payments')} />
        <StatCard label="Outstanding" value={money(data.outstanding)} sub="Across unpaid tenants" icon={<IconClock size={18} />} onClick={() => nav('/manager/tenants')} />
        <StatCard label="Occupancy" value={`${data.occupancy}%`} sub={`${data.occupied} of ${data.totalUnits} units`} icon={<IconBuilding size={18} />} onClick={() => nav('/manager/properties')} />
        <StatCard label="Pending approvals" value={data.pending.length} sub="Awaiting your review" icon={<IconCheckCircle size={18} />} onClick={() => nav('/manager/approvals')} />
      </div>

      {/* Rent collection donut — collected (per time frame) vs current outstanding */}
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
          centerValue={money(collected)} centerLabel="Collected"
          segments={[
            { label: 'Collected', value: collected, color: 'var(--green)' },
            { label: 'Outstanding', value: data.outstanding, color: 'var(--warn)' },
          ]} />
      </div>

      <div className="grid dash-split">
        {/* Pending approvals */}
        <div className="card">
          <div className="card-head">
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
          <div className="card-head">
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
                    <span className="mono" style={{ fontWeight: 600, color: 'var(--green)' }}>{money(p.amount)}</span>
                  </div>
                  <div style={{ marginTop: 5 }}><PeriodTag from={p.period_from} to={p.period_to} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        /* Two panels side by side on desktop, stacked on phones. */
        .dash-split { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); }
        /* Card header: title left, action right — wraps instead of squashing. */
        .card-head {
          display: flex; align-items: center; justify-content: space-between;
          gap: 10px; flex-wrap: wrap; padding: 18px 20px 12px;
        }
        .card-head h3 { margin: 0; min-width: 0; }
        .card-head .btn { flex-shrink: 0; white-space: nowrap; }
        @media (max-width: 860px) {
          .dash-split { grid-template-columns: 1fr; }
          /* Keep the title + action on one line on phones. */
          .card-head { padding: 16px 16px 10px; }
          .card-head h3 { font-size: 1.08rem; }
        }
      `}</style>
    </div>
  )
}

// A banking-app style "needs attention" strip: the things to act on today, each
// a tap straight to where it's handled. Hidden entirely when nothing's pending,
// replaced by a quiet "all caught up" so the dashboard leads with actions.
function AttentionBar({ data, nav }) {
  const items = [
    { n: data.pending.length, label: data.pending.length === 1 ? 'payment to approve' : 'payments to approve', to: '/manager/approvals', tone: 'gold', icon: <IconCheckCircle size={16} /> },
    { n: data.overdue, label: data.overdue === 1 ? 'tenant overdue' : 'tenants overdue', to: '/manager/tenants', tone: 'red', icon: <IconClock size={16} /> },
    { n: data.dueReminders, label: 'reminders due', to: '/manager/reminders', tone: 'gold', icon: <IconClock size={16} /> },
    { n: data.openRepairs, label: data.openRepairs === 1 ? 'open repair' : 'open repairs', to: '/manager/maintenance', tone: 'blue', icon: <IconBuilding size={16} /> },
  ].filter((i) => i.n > 0)

  if (items.length === 0) {
    return (
      <div className="attn-clear">
        <IconCheckCircle size={16} /> <span>You’re all caught up — nothing needs your attention.</span>
      </div>
    )
  }

  return (
    <div className="attn-row">
      {items.map((i) => (
        <button key={i.label} className={`attn-chip ${i.tone}`} onClick={() => nav(i.to)}>
          <span className="attn-ico">{i.icon}</span>
          <span className="attn-n">{i.n}</span>
          <span className="attn-label">{i.label}</span>
          <IconArrowRight size={14} className="attn-go" />
        </button>
      ))}

      <style>{`
        .attn-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
        .attn-chip { display: inline-flex; align-items: center; gap: 9px; padding: 11px 15px; border-radius: 12px;
          background: var(--surface); border: 1px solid var(--line); cursor: pointer; transition: all 0.15s; text-align: left; }
        .attn-chip:hover { transform: translateY(-1px); box-shadow: var(--shadow-soft); }
        .attn-ico { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0; }
        .attn-n { font-size: 1.15rem; font-weight: 700; }
        .attn-label { font-size: 0.86rem; color: var(--text-dim); }
        .attn-go { color: var(--text-faint); margin-left: 2px; }
        .attn-chip.gold { border-color: var(--gold-line); } .attn-chip.gold .attn-ico { background: var(--gold-bg); color: var(--gold); }
        .attn-chip.red  { border-color: color-mix(in srgb, var(--danger) 35%, var(--line)); } .attn-chip.red .attn-ico { background: color-mix(in srgb, var(--danger) 14%, transparent); color: var(--danger); }
        .attn-chip.blue { border-color: var(--green-line); } .attn-chip.blue .attn-ico { background: var(--green-bg); color: var(--green); }
        .attn-clear { display: flex; align-items: center; gap: 9px; margin-bottom: 20px; padding: 12px 15px;
          border-radius: 12px; background: var(--green-bg); border: 1px solid var(--green-line); color: var(--green); font-size: 0.88rem; }
      `}</style>
    </div>
  )
}
