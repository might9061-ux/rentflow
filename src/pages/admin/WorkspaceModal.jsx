import { useEffect, useState } from 'react'
import { db } from '../../lib/db.js'
import { money, fmtDate } from '../../lib/format.js'
import { tierForCapacity } from '../../lib/pricing.js'
import { StatCard, Spinner, EmptyState } from '../../components/ui.jsx'
import Modal from '../../components/Modal.jsx'
import { IconBuilding } from '../../components/icons.jsx'

// Drill-down for a single workspace — its subscription history + fee summary.
export default function WorkspaceModal({ workspace, onClose }) {
  const [rows, setRows] = useState(null)
  useEffect(() => { (async () => setRows(await db.listSubscriptionPayments(workspace.id)))() }, [workspace.id])
  return (
    <Modal wide title={workspace.name} onClose={onClose} footer={<button className="btn ghost" onClick={onClose}>Close</button>}>
      <div className="row gap wrap" style={{ marginBottom: 14 }}>
        <span className="pill neutral"><IconBuilding size={12} /> {tierForCapacity(workspace.plan_capacity).name} · ≤{workspace.plan_capacity}</span>
        {workspace.plan_active ? <span className="pill ok"><span className="dot" /> Active</span> : <span className="pill rejected">Inactive</span>}
        <span className="muted" style={{ fontSize: '0.82rem' }}>{workspace.email} · joined {fmtDate(workspace.joined_at)}</span>
      </div>
      <div className="grid stats" style={{ marginBottom: 16 }}>
        <StatCard label="Subscriptions paid" value={money(workspace.total_paid)} sub={`${workspace.payments} payments`} />
        <StatCard label="Rent processed" value={money(workspace.rent_volume || 0)} sub="Tenant payments" />
        <StatCard label="Transaction fees" value={money(workspace.fees || 0)} sub="0.5% to platform" />
      </div>
      {!rows ? <div className="center" style={{ minHeight: 80 }}><Spinner /></div>
        : rows.length === 0 ? <EmptyState icon="🧾" title="No payments yet" /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Date</th><th>For</th><th>Method</th><th>Reference</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="nowrap">{fmtDate(p.created_at)}</td>
                    <td className="muted">{p.period}</td>
                    <td>{p.method}</td>
                    <td className="mono muted">{p.reference}</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Modal>
  )
}
