import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { db } from '../../lib/db.js'
import { money, fmtDate } from '../../lib/format.js'
import { rangeFor, inRange, monthRange, periodLabel, deltaPct } from '../../lib/period.js'
import { downloadExcel } from '../../lib/excel.js'
import { StatCard, Spinner, EmptyState } from '../../components/ui.jsx'
import { MiniBars } from '../../components/Charts.jsx'
import Modal from '../../components/Modal.jsx'
import { IconWallet, IconChart, IconBuilding, IconArrowRight, IconReceipt } from '../../components/icons.jsx'

export default function AdminFees() {
  const [all, setAll] = useState(null)
  const [detail, setDetail] = useState(null)
  const { period } = useOutletContext()
  const nav = useNavigate()
  useEffect(() => { (async () => setAll(await db.adminTransactions()))() }, [])
  if (!all) return <div className="center" style={{ minHeight: 320 }}><Spinner /></div>

  const range = rangeFor(period)
  const payments = all.payments.filter((p) => inRange(p.created_at, range))
  const totalFees = payments.reduce((s, p) => s + p.fee, 0)
  const totalVolume = payments.reduce((s, p) => s + p.amount, 0)

  const monthFees = (off) => { const r = monthRange(off); return all.payments.filter((p) => inRange(p.created_at, r)).reduce((s, p) => s + p.fee, 0) }
  const thisM = monthFees(0), lastM = monthFees(1), delta = deltaPct(lastM, thisM)

  // One row per company; the individual transactions live behind a click.
  const byId = new Map()
  const groups = []
  payments.forEach((p) => {
    if (!byId.has(p.manager_id)) {
      const g = { id: p.manager_id, company: p.workspace, manager: p.manager, volume: 0, fees: 0, rows: [] }
      byId.set(p.manager_id, g); groups.push(g)
    }
    const g = byId.get(p.manager_id); g.rows.push(p); g.volume += p.amount; g.fees += p.fee
  })
  groups.sort((a, b) => b.fees - a.fees)

  return (
    <>
      <div className="spread page-head">
        <div>
          <div className="eyebrow">Revenue · {periodLabel(period)}</div>
          <h1>Transaction fees</h1>
          <p>The 0.5% earned on every rent payment — tap a company to see its transactions.</p>
        </div>
        <button className="btn ghost" disabled={payments.length === 0} onClick={() => downloadExcel(
          `rentflow-transaction-fees-${new Date().toISOString().slice(0, 10)}`, payments, [
            { header: 'Date', value: (p) => fmtDate(p.created_at) },
            { header: 'Company', value: (p) => p.workspace },
            { header: 'Manager', value: (p) => p.manager },
            { header: 'Tenant', value: (p) => p.tenant },
            { header: 'Method', value: (p) => p.method },
            { header: 'Amount', value: (p) => Number(p.amount).toFixed(2), numeric: true },
            { header: 'Fee (0.5%)', value: (p) => Number(p.fee).toFixed(2), numeric: true },
          ], { sheet: 'Transaction fees', title: `RentLoja — Transaction fees (${periodLabel(period)})` })}>
          <IconReceipt size={15} /> Export Excel
        </button>
      </div>

      <div className="grid stats" style={{ marginBottom: 22 }}>
        <StatCard label="Total fees" value={money(totalFees)} sub={`${periodLabel(period)} · subscriptions`} icon={<IconWallet size={18} />} onClick={() => nav('/admin/subscriptions')} />
        <StatCard label="Rent processed" value={money(totalVolume)} sub="Volume the fee is on · workspaces" icon={<IconChart size={18} />} onClick={() => nav('/admin/workspaces')} />
        <StatCard label="Companies" value={groups.length} sub={`${payments.length} transactions · view`} icon={<IconBuilding size={18} />} onClick={() => nav('/admin/workspaces')} />
      </div>

      <div className="card pad" style={{ marginBottom: 20 }}>
        <div className="spread wrap" style={{ marginBottom: 12 }}>
          <h3>Fees: this vs last month</h3>
          <span className={`pill ${delta >= 0 ? 'ok' : 'rejected'}`}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%</span>
        </div>
        <MiniBars bars={[{ label: 'Last month', value: lastM, color: 'var(--line)' }, { label: 'This month', value: thisM, color: 'var(--gold)' }]} />
      </div>

      <div className="card">
        {groups.length === 0 ? <EmptyState icon="🧾" title="No transactions yet" /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Company</th><th>Manager</th><th style={{ textAlign: 'right' }}>Rent processed</th><th style={{ textAlign: 'right' }}>Payments</th><th style={{ textAlign: 'right' }}>Fees (0.5%)</th><th className="no-print"></th></tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id} className="clickable-row" onClick={() => setDetail(g)}>
                    <td style={{ fontWeight: 600 }}>{g.company}</td>
                    <td className="muted">{g.company !== g.manager ? g.manager : '—'}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{money(g.volume)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{g.rows.length}</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--gold)' }}>{money(g.fees)}</td>
                    <td className="muted" style={{ textAlign: 'right' }}><IconArrowRight size={14} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && <CompanyFeesModal group={detail} onClose={() => setDetail(null)} />}
    </>
  )
}

function CompanyFeesModal({ group, onClose }) {
  return (
    <Modal wide title={group.company} onClose={onClose} footer={<button className="btn ghost" onClick={onClose}>Close</button>}>
      <div className="grid stats" style={{ marginBottom: 16 }}>
        <StatCard label="Rent processed" value={money(group.volume)} sub={`${group.rows.length} payments`} />
        <StatCard label="Transaction fees" value={money(group.fees)} sub="0.5% to platform" />
        <StatCard label="Manager" value={group.manager} />
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Date</th><th>Tenant</th><th>Method</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>Fee</th></tr></thead>
          <tbody>
            {group.rows.map((p) => (
              <tr key={p.id}>
                <td className="nowrap">{fmtDate(p.created_at)}</td>
                <td className="muted">{p.tenant}</td>
                <td>{p.method}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{money(p.amount)}</td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--gold)' }}>{money(p.fee)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
