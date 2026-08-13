import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { db } from '../../lib/db.js'
import { money, fmtDate, fullName } from '../../lib/format.js'
import { WORKER_CATEGORIES, monthlyEstimate, thisPeriodLabel, inThisMonth, workerKey } from '../../lib/payroll.js'
import { Spinner, EmptyState } from '../../components/ui.jsx'
import { IconUsers } from '../../components/icons.jsx'

export default function Payroll() {
  const { userId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [payees, setPayees] = useState([])
  const [payroll, setPayroll] = useState([])
  const [team, setTeam] = useState([])

  const load = useCallback(async () => {
    const [p, r, t] = await Promise.all([
      db.listPayees(userId), db.listPayroll(userId), db.listTeam(userId).catch(() => []),
    ])
    setPayees(p); setPayroll(r); setTeam(t); setLoading(false)
  }, [userId])
  useEffect(() => { load() }, [load])

  if (loading) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>

  const active = payees.filter((p) => p.active !== false)
  const monthlyTotal = active.reduce((s, p) => s + monthlyEstimate(p), 0)
  const paidThisMonth = payroll.filter((p) => inThisMonth(p.paid_on || p.created_at)).reduce((s, p) => s + Number(p.amount), 0)
  const usedCategories = WORKER_CATEGORIES.filter((c) => active.some((p) => (p.category || 'Other') === c))
  // Count unique people: payroll workers plus agents (an agent already added as a
  // payee is only counted once — matched by name + phone, same as the Workers page).
  const agentKeys = new Set(team.map((a) => workerKey(fullName(a), a.phone)))
  const workerCount = active.filter((p) => !agentKeys.has(workerKey(p.name, p.phone))).length + team.length

  return (
    <div className="page" style={{ maxWidth: 940 }}>
      <div className="page-head">
        <div className="eyebrow">Wages</div>
        <h1>Payroll</h1>
        <p>What you spend on staff each month, and every salary payment you’ve made — all logged to Finances as a salary expense.</p>
      </div>

      {/* Executive summary bar — the three stat cards folded into one line. */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="spread wrap" style={{ padding: '14px 18px', gap: 10 }}>
          <div className="row gap wrap" style={{ alignItems: 'baseline' }}>
            <b style={{ fontSize: '1.05rem' }}>{money(monthlyTotal)}/mo fixed</b>
            <span className="muted" style={{ fontSize: '0.84rem' }}>
              · {money(paidThisMonth)} paid in {thisPeriodLabel()} · {workerCount} worker{workerCount === 1 ? '' : 's'}
              {team.length ? ` (incl. ${team.length} agent${team.length === 1 ? '' : 's'})` : usedCategories.length ? ` · ${usedCategories.length} categories` : ''}
            </span>
          </div>
          <Link className="btn primary sm" to="/manager/workers"><IconUsers size={15} /> Pay workers</Link>
        </div>
        <div className="divider" style={{ margin: 0 }} />

        {payroll.length === 0 ? (
          <EmptyState icon="🧾" title="No payments yet">Pay a worker from the <Link to="/manager/workers">Workers</Link> page and it will appear here.</EmptyState>
        ) : (
          payroll.slice(0, 20).map((p) => (
            <div key={p.id} className="pay-row">
              <span className="pay-avatar">{(p.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{p.name}</span>
                {(p.category || p.role) && <span className="muted"> · {p.category || p.role}</span>}
                <div className="muted pay-sub">{p.period || '—'} · {p.method} · {fmtDate(p.paid_on)}</div>
              </div>
              <span className="mono" style={{ fontWeight: 600, color: 'var(--danger)', whiteSpace: 'nowrap' }}>−{money(p.amount)}</span>
            </div>
          ))
        )}
        <style>{`
          .pay-row { display:flex; align-items:center; gap:12px; padding:12px 16px; border-bottom:1px solid var(--line-soft); transition:background 0.13s; }
          .pay-row:last-child { border-bottom:none; }
          .pay-row:hover { background:var(--accent-bg); }
          .pay-avatar { width:32px; height:32px; border-radius:99px; flex-shrink:0; display:grid; place-items:center;
            background:var(--accent-bg); color:var(--accent); font-size:0.72rem; font-weight:700; border:1px solid var(--accent-line); }
          .pay-sub { font-size:0.78rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        `}</style>
      </div>
    </div>
  )
}
