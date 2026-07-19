import { useState } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { money, timeAgo } from '../../lib/format.js'
import { tierForCapacity } from '../../lib/pricing.js'
import { rangeFor, inRange, periodLabel } from '../../lib/period.js'
import { StatCard, Spinner, EmptyState } from '../../components/ui.jsx'
import { IconBuilding, IconUsers, IconWallet, IconShield } from '../../components/icons.jsx'
import WorkspaceModal from './WorkspaceModal.jsx'

export default function AdminWorkspaces() {
  const { overview: data, period, reload } = useOutletContext()
  const [drill, setDrill] = useState(null)
  const nav = useNavigate()
  if (!data) return <div className="center" style={{ minHeight: 320 }}><Spinner /></div>

  // Rent processed per workspace, scoped to the selected time-frame.
  const range = rangeFor(period)
  const txns = (data.transactions || []).filter((t) => inRange(t.created_at, range))
  const rentByWs = new Map()
  txns.forEach((t) => rentByWs.set(t.manager_id, (rentByWs.get(t.manager_id) || 0) + t.amount))

  const ws = data.workspaces
  const totalRent = txns.reduce((s, t) => s + t.amount, 0)
  const totalAgents = ws.reduce((s, w) => s + (w.agents || 0), 0)

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">Customers · {periodLabel(period)}</div>
        <h1>Workspaces</h1>
        <p>Every manager (company) on the platform, with their agents and tenants. Tap one for its full history.</p>
      </div>

      <div className="grid stats" style={{ marginBottom: 22 }}>
        <StatCard label="Managers (companies)" value={ws.length} sub={`${data.activeSubs} active · subscriptions`} icon={<IconBuilding size={18} />} onClick={() => nav('/admin/subscriptions')} />
        <StatCard label="Agents" value={totalAgents} sub="Across all companies · users" icon={<IconShield size={18} />} onClick={() => nav('/admin/users')} />
        <StatCard label="Tenants" value={ws.reduce((s, w) => s + w.tenants, 0)} sub="End users · users" icon={<IconUsers size={18} />} onClick={() => nav('/admin/users')} />
        <StatCard label="Rent processed" value={money(totalRent)} sub={`${periodLabel(period)} · fees`} icon={<IconWallet size={18} />} onClick={() => nav('/admin/fees')} />
      </div>

      <div className="card">
        {ws.length === 0 ? <EmptyState icon="🏢" title="No workspaces yet" /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Company</th><th>Plan</th><th>Status</th><th style={{ textAlign: 'right' }}>Agents</th><th style={{ textAlign: 'right' }}>Tenants</th><th style={{ textAlign: 'right' }}>Rent ({periodLabel(period).toLowerCase()})</th><th style={{ textAlign: 'right' }}>Subs paid</th></tr></thead>
              <tbody>
                {ws.map((w) => (
                  <tr key={w.id} className="clickable-row" onClick={() => setDrill(w)}>
                    <td><div style={{ fontWeight: 600 }}>{w.company}</div><div className="muted" style={{ fontSize: '0.8rem' }}>{w.company !== w.name ? w.name : w.email}</div></td>
                    <td><span className="pill neutral">{tierForCapacity(w.plan_capacity).name}</span></td>
                    <td>{w.plan_active ? <span className="pill ok"><span className="dot" /> Active</span> : <span className="pill rejected">Inactive</span>}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{w.agents || 0}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{w.tenants}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{money(rentByWs.get(w.id) || 0)}</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--gold)' }}>{money(w.total_paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {drill && <WorkspaceModal workspace={drill} onClose={() => setDrill(null)} onChanged={reload} />}
    </>
  )
}
