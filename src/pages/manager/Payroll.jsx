import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { db } from '../../lib/db.js'
import { money, fmtDate } from '../../lib/format.js'
import { WORKER_CATEGORIES, monthlyEstimate, thisPeriodLabel, inThisMonth } from '../../lib/payroll.js'
import { StatCard, Spinner, EmptyState } from '../../components/ui.jsx'
import { IconCash, IconUsers, IconWallet, IconArrowRight } from '../../components/icons.jsx'

export default function Payroll() {
  const { userId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [payees, setPayees] = useState([])
  const [payroll, setPayroll] = useState([])

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([db.listPayees(userId), db.listPayroll(userId)])
    setPayees(p); setPayroll(r); setLoading(false)
  }, [userId])
  useEffect(() => { load() }, [load])

  if (loading) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>

  const active = payees.filter((p) => p.active !== false)
  const monthlyTotal = active.reduce((s, p) => s + monthlyEstimate(p), 0)
  const paidThisMonth = payroll.filter((p) => inThisMonth(p.paid_on || p.created_at)).reduce((s, p) => s + Number(p.amount), 0)
  const usedCategories = WORKER_CATEGORIES.filter((c) => active.some((p) => (p.category || 'Other') === c))

  return (
    <div className="page" style={{ maxWidth: 940 }}>
      <div className="spread page-head">
        <div>
          <div className="eyebrow">Wages</div>
          <h1>Payroll</h1>
          <p>What you spend on staff each month, and every salary payment you’ve made — all logged to Finances as a salary expense.</p>
        </div>
        <Link className="btn primary" to="/manager/workers"><IconUsers size={16} /> Manage workers</Link>
      </div>

      <div className="grid stats" style={{ marginBottom: 22 }}>
        <StatCard label="Est. monthly payroll" value={money(monthlyTotal)} sub="Fixed wages (excl. per-task)" icon={<IconCash size={18} />} />
        <StatCard label="Paid this month" value={money(paidThisMonth)} sub={thisPeriodLabel()} icon={<IconWallet size={18} />} />
        <StatCard label="Workers" value={active.length} sub={`${usedCategories.length} categories`} icon={<IconUsers size={18} />} />
      </div>

      <div className="card">
        <div className="spread" style={{ padding: '16px 18px 12px' }}>
          <h3>Payment history</h3>
          <Link className="btn sm ghost" to="/manager/workers">Workers <IconArrowRight size={14} /></Link>
        </div>
        <div className="divider" style={{ margin: 0 }} />
        {payroll.length === 0 ? (
          <EmptyState icon="🧾" title="No payments yet">Pay a worker from the <Link to="/manager/workers">Workers</Link> page and it will appear here.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Date</th><th>Person</th><th>For</th><th>Method</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
              <tbody>
                {payroll.slice(0, 20).map((p) => (
                  <tr key={p.id}>
                    <td className="nowrap">{fmtDate(p.paid_on)}</td>
                    <td><div style={{ fontWeight: 600 }}>{p.name}</div><div className="muted" style={{ fontSize: '0.78rem' }}>{p.category || p.role || ''}</div></td>
                    <td className="muted">{p.period || '—'}</td>
                    <td>{p.method}</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--danger)' }}>−{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
