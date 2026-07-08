import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { db } from '../../lib/db.js'
import { money, fmtDate } from '../../lib/format.js'
import { rangeFor, inRange, monthRange, periodLabel, deltaPct } from '../../lib/period.js'
import { downloadExcel } from '../../lib/excel.js'
import { StatCard, Spinner, EmptyState } from '../../components/ui.jsx'
import { MiniBars } from '../../components/Charts.jsx'
import Modal from '../../components/Modal.jsx'
import { IconChart, IconWallet, IconBuilding, IconArrowRight, IconReceipt } from '../../components/icons.jsx'

export default function AdminSubscriptions() {
  const [all, setAll] = useState(null)
  const [detail, setDetail] = useState(null)
  const { period } = useOutletContext()
  const nav = useNavigate()
  useEffect(() => { (async () => setAll(await db.adminSubscriptions()))() }, [])
  if (!all) return <div className="center" style={{ minHeight: 320 }}><Spinner /></div>

  // Scope payments to the selected time-frame.
  const range = rangeFor(period)
  const payments = all.payments.filter((p) => inRange(p.created_at, range))
  const total = payments.reduce((s, p) => s + Number(p.amount), 0)

  // Month-on-month comparison (independent of the selector).
  const monthSum = (off) => { const r = monthRange(off); return all.payments.filter((p) => inRange(p.created_at, r)).reduce((s, p) => s + Number(p.amount), 0) }
  const thisM = monthSum(0), lastM = monthSum(1), delta = deltaPct(lastM, thisM)

  // One row per company; the payments live behind a click.
  const byId = new Map()
  const groups = []
  payments.forEach((p) => {
    if (!byId.has(p.manager_id)) {
      const g = { id: p.manager_id, company: p.company || p.workspace, manager: p.workspace, total: 0, payments: [] }
      byId.set(p.manager_id, g); groups.push(g)
    }
    const g = byId.get(p.manager_id); g.payments.push(p); g.total += Number(p.amount)
  })
  groups.sort((a, b) => b.total - a.total)

  return (
    <>
      <div className="spread page-head">
        <div>
          <div className="eyebrow">Revenue · {periodLabel(period)}</div>
          <h1>Subscriptions</h1>
          <p>Each company’s plan payments — tap a company to see its installments.</p>
        </div>
        <button className="btn ghost" disabled={payments.length === 0} onClick={() => downloadExcel(
          `rentflow-subscriptions-${new Date().toISOString().slice(0, 10)}`, payments, [
            { header: 'Date', value: (p) => fmtDate(p.created_at) },
            { header: 'Company', value: (p) => p.company || p.workspace },
            { header: 'Manager', value: (p) => p.workspace },
            { header: 'For', value: (p) => p.period },
            { header: 'Method', value: (p) => p.method },
            { header: 'Reference', value: (p) => p.reference || '' },
            { header: 'Amount', value: (p) => Number(p.amount).toFixed(2), numeric: true },
          ], { sheet: 'Subscriptions', title: `MightyRent — Subscriptions (${periodLabel(period)})` })}>
          <IconReceipt size={15} /> Export Excel
        </button>
      </div>

      <div className="grid stats" style={{ marginBottom: 22 }}>
        <StatCard label="Subscription revenue" value={money(total)} sub={`${periodLabel(period)} · view fees`} icon={<IconWallet size={18} />} onClick={() => nav('/admin/fees')} />
        <StatCard label="MRR" value={money(all.mrr)} sub="Monthly recurring · workspaces" icon={<IconChart size={18} />} onClick={() => nav('/admin/workspaces')} />
        <StatCard label="Companies" value={groups.length} sub={`${payments.length} payments · view`} icon={<IconBuilding size={18} />} onClick={() => nav('/admin/workspaces')} />
      </div>

      <div className="card pad" style={{ marginBottom: 20 }}>
        <div className="spread wrap" style={{ marginBottom: 12 }}>
          <h3>Subscriptions: this vs last month</h3>
          <span className={`pill ${delta >= 0 ? 'ok' : 'rejected'}`}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%</span>
        </div>
        <MiniBars bars={[{ label: 'Last month', value: lastM, color: 'var(--line)' }, { label: 'This month', value: thisM, color: 'var(--gold)' }]} />
      </div>

      <div className="card">
        {groups.length === 0 ? <EmptyState icon="🧾" title="No subscription payments yet" /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Company</th><th>Manager</th><th style={{ textAlign: 'right' }}>Payments</th><th style={{ textAlign: 'right' }}>Total paid</th><th className="no-print"></th></tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id} className="clickable-row" onClick={() => setDetail(g)}>
                    <td style={{ fontWeight: 600 }}>{g.company}</td>
                    <td className="muted">{g.company !== g.manager ? g.manager : '—'}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{g.payments.length}</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--gold)' }}>{money(g.total)}</td>
                    <td className="muted" style={{ textAlign: 'right' }}><IconArrowRight size={14} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && <CompanySubsModal group={detail} onClose={() => setDetail(null)} />}
    </>
  )
}

function CompanySubsModal({ group, onClose }) {
  return (
    <Modal wide title={group.company} onClose={onClose} footer={<button className="btn ghost" onClick={onClose}>Close</button>}>
      <div className="row gap wrap" style={{ marginTop: -6, marginBottom: 14 }}>
        {group.company !== group.manager && <span className="pill neutral">{group.manager}</span>}
        <span className="muted" style={{ fontSize: '0.84rem' }}>{group.payments.length} payments · {money(group.total)} total</span>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Date</th><th>For</th><th>Method</th><th>Reference</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
          <tbody>
            {group.payments.map((p) => (
              <tr key={p.id}>
                <td className="nowrap">{fmtDate(p.created_at)}</td>
                <td className="muted">{p.period}</td>
                <td>{p.method}</td>
                <td className="mono muted">{p.reference}</td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--green)' }}>{money(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
