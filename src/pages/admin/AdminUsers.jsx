import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../../lib/db.js'
import { StatCard, Spinner, EmptyState } from '../../components/ui.jsx'
import { DonutChart } from '../../components/Charts.jsx'
import { IconUsers, IconKey, IconShield, IconBuilding } from '../../components/icons.jsx'

export default function AdminUsers() {
  const [data, setData] = useState(null)
  const nav = useNavigate()
  useEffect(() => { (async () => setData(await db.adminUsers()))() }, [])
  if (!data) return <div className="center" style={{ minHeight: 320 }}><Spinner /></div>

  const { tenants, managers, agents } = data.totals

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">People</div>
        <h1>Users</h1>
        <p>Everyone using MightyRent — managers, their agents, and tenants — and how they split per company.</p>
      </div>

      <div className="grid stats" style={{ marginBottom: 22 }}>
        <StatCard label="All users" value={data.total} sub="On the platform" icon={<IconUsers size={18} />} />
        <StatCard label="Managers" value={managers} sub="Company owners · view" icon={<IconKey size={18} />} onClick={() => nav('/admin/workspaces')} />
        <StatCard label="Agents" value={agents} sub="Sub-managers" icon={<IconShield size={18} />} />
        <StatCard label="Tenants" value={tenants} sub="End users" icon={<IconBuilding size={18} />} />
      </div>

      <div className="card pad" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 14 }}>Who’s using the app</h3>
        <DonutChart
          centerValue={data.total} centerLabel="people" fmt={(v) => v}
          segments={[
            { label: 'Tenants', value: tenants, color: 'var(--green)' },
            { label: 'Managers', value: managers, color: 'var(--gold)' },
            { label: 'Agents', value: agents, color: '#7c9cf0' },
          ]} />
      </div>

      <div className="card">
        <div className="spread" style={{ padding: '16px 18px 12px' }}><h3>Per company</h3></div>
        <div className="divider" style={{ margin: 0 }} />
        {data.perCompany.length === 0 ? <EmptyState icon="🏢" title="No companies yet" /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Company</th><th>Manager</th><th style={{ textAlign: 'right' }}>Agents</th><th style={{ textAlign: 'right' }}>Tenants</th><th style={{ textAlign: 'right' }}>People</th></tr></thead>
              <tbody>
                {data.perCompany.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.company}</td>
                    <td className="muted">{c.company !== c.manager ? c.manager : '—'}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{c.agents}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{c.tenants}</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--gold)' }}>{c.agents + c.tenants + 1}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
