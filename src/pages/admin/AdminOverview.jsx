import { useOutletContext, useNavigate } from 'react-router-dom'
import { money, fmtDate } from '../../lib/format.js'
import { rangeFor, inRange, monthRange, periodLabel, deltaPct } from '../../lib/period.js'
import { StatCard, Spinner } from '../../components/ui.jsx'
import { MiniBars } from '../../components/Charts.jsx'
import { IconWallet, IconChart, IconTag, IconBuilding } from '../../components/icons.jsx'

export default function AdminOverview() {
  const { overview: data, period } = useOutletContext()
  const nav = useNavigate()
  if (!data) return <div className="center" style={{ minHeight: 320 }}><Spinner /></div>

  const subs = data.subscriptions || []
  const txns = data.transactions || []
  const sumIn = (rows, range, key) => rows.reduce((s, r) => (inRange(r.created_at, range) ? s + (Number(r[key]) || 0) : s), 0)

  const range = rangeFor(period)
  const subRev = sumIn(subs, range, 'amount')
  const feeRev = sumIn(txns, range, 'fee')
  const totalRev = subRev + feeRev

  // This month vs last month (for the comparison chart) — always month-on-month.
  const tm = monthRange(0), lm = monthRange(1)
  const revThis = sumIn(subs, tm, 'amount') + sumIn(txns, tm, 'fee')
  const revLast = sumIn(subs, lm, 'amount') + sumIn(txns, lm, 'fee')
  const delta = deltaPct(revLast, revThis)

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">Overview · {periodLabel(period)}</div>
        <h1>Subscriptions & revenue</h1>
        <p>Your platform at a glance — tap any card to dig in.</p>
      </div>

      <div className="grid stats" style={{ marginBottom: 22 }}>
        <StatCard label="Total revenue" value={money(totalRev)} sub={`${periodLabel(period)} · subs + fees`} icon={<IconWallet size={18} />} onClick={() => nav('/admin/subscriptions')} />
        <StatCard label="Subscriptions" value={money(subRev)} sub={`${money(data.mrr)} MRR · view`} icon={<IconTag size={18} />} onClick={() => nav('/admin/subscriptions')} />
        <StatCard label="Transaction fees" value={money(feeRev)} sub="0.5% on rent · view" icon={<IconChart size={18} />} onClick={() => nav('/admin/fees')} />
        <StatCard label="Workspaces" value={`${data.activeSubs}/${data.totalWorkspaces}`} sub="Active · view" icon={<IconBuilding size={18} />} onClick={() => nav('/admin/workspaces')} />
      </div>

      <div className="card pad" style={{ marginBottom: 20 }}>
        <div className="spread wrap" style={{ marginBottom: 12 }}>
          <h3>Revenue: this vs last month</h3>
          <span className={`pill ${delta >= 0 ? 'ok' : 'rejected'}`}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%</span>
        </div>
        <MiniBars bars={[
          { label: 'Last month', value: revLast, color: 'var(--line)' },
          { label: 'This month', value: revThis, color: 'var(--gold)' },
        ]} />
      </div>

      <div className="card">
        <div className="spread" style={{ padding: '16px 18px 12px' }}>
          <h3>Recent subscription payments</h3>
          <button className="btn ghost sm" onClick={() => nav('/admin/subscriptions')}>View all</button>
        </div>
        <div className="divider" style={{ margin: 0 }} />
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Workspace</th><th>For</th><th>Method</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
            <tbody>
              {data.recentPayments.slice(0, 8).map((p) => (
                <tr key={p.id}>
                  <td className="nowrap">{fmtDate(p.created_at)}</td>
                  <td style={{ fontWeight: 600 }}>{p.workspace}</td>
                  <td className="muted">{p.period}</td>
                  <td>{p.method}</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--green)' }}>{money(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
