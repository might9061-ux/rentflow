import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { db } from '../../lib/db.js'
import { money, monthYear } from '../../lib/format.js'
import { periodForDate, currentPeriod, formatPeriod } from '../../lib/billing.js'
import { StatusPill, PeriodTag, Spinner } from '../../components/ui.jsx'
import ReceiptModal from '../../components/Receipt.jsx'
import { IconReceipt } from '../../components/icons.jsx'

export default function PaymentHistory() {
  const { userId, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [payments, setPayments] = useState([])
  const [manager, setManager] = useState(null)
  const [property, setProperty] = useState(null)
  const [range, setRange] = useState(12) // 12 months | 60 months (5 years)
  const [viewing, setViewing] = useState(null)

  useEffect(() => {
    (async () => {
      const [pays, mgr] = await Promise.all([db.listTenantPayments(userId), db.getTenantManager(userId)])
      setPayments(pays); setManager(mgr)
      setLoading(false)
    })()
  }, [userId])

  // Map payments by the YYYY-MM of their period_from for quick lookup.
  const byPeriod = useMemo(() => {
    const m = {}
    for (const p of payments) {
      const key = (p.period_from || '').slice(0, 7)
      // Prefer approved > pending > rejected when multiple exist for a period.
      if (!m[key] || rank(p.status) > rank(m[key].status)) m[key] = p
    }
    return m
  }, [payments])

  // Build the month timeline going backwards — but never earlier than when the
  // tenancy actually began (lease start, or the account's creation). No point
  // showing "Not Paid" for months before the tenant existed.
  const months = useMemo(() => {
    const out = []
    const dueDay = profile?.due_day || 1
    const curKey = currentPeriod(dueDay).from.slice(0, 7)
    const startSrc = profile?.lease_start || profile?.created_at
    let startKey = startSrc ? periodForDate(new Date(startSrc), dueDay).from.slice(0, 7) : '0000-00'
    if (startKey > curKey) startKey = curKey // always show at least the current period
    // Walk back one real billing period at a time (start at the current period).
    let period = currentPeriod(dueDay)
    for (let i = 0; i < range; i++) {
      const key = period.from.slice(0, 7)
      if (key < startKey) break // reached before the tenancy started
      out.push({ key, period, payment: byPeriod[key] || null })
      const prevAnchor = new Date(new Date(period.from).getTime() - 86400000) // day before this period
      period = periodForDate(prevAnchor, dueDay)
    }
    return out
  }, [range, byPeriod, profile])

  if (loading) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>

  const statusFor = (p) => {
    if (!p) return 'not_paid'
    return p.status === 'approved' ? 'paid' : p.status // pending | rejected
  }

  return (
    <div className="page">
      <div className="spread page-head">
        <div>
          <div className="eyebrow">Records</div>
          <h1>Payment history</h1>
          <p>Your rent status month by month.</p>
        </div>
        <div className="seg">
          <button className={range === 12 ? 'on' : ''} onClick={() => setRange(12)}>Last 12 months</button>
          <button className={range === 60 ? 'on' : ''} onClick={() => setRange(60)}>Full 5 years</button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Month</th><th>Billing period</th><th>Status</th><th>Amount</th><th>Method</th><th>Receipt</th></tr></thead>
          <tbody>
            {months.map((m) => {
              const p = m.payment
              const st = statusFor(p)
              return (
                <tr key={m.key} className={st === 'paid' ? 'clickable-row' : ''} onClick={st === 'paid' ? () => setViewing(p) : undefined}>
                  <td style={{ fontWeight: 600 }}>{monthYear(m.period.from, true)}</td>
                  <td><PeriodTag period={m.period} /></td>
                  <td><StatusPill status={st} /></td>
                  <td className="mono">
                    {p ? (
                      <>
                        {money(p.amount)}
                        {(p.created_at || p.paid_date) && (
                          <div className="muted" style={{ fontSize: '0.72rem', fontWeight: 400 }}>{fmtDateTime(p.created_at || p.paid_date)}</div>
                        )}
                      </>
                    ) : <span className="faint">—</span>}
                  </td>
                  <td>{p?.method || <span className="faint">—</span>}</td>
                  <td>
                    {st === 'paid'
                      ? <button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); setViewing(p) }}><IconReceipt size={14} /> Receipt</button>
                      : <span className="faint">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {viewing && (
        <ReceiptModal payment={viewing} tenant={profile} manager={manager} property={property}
          onClose={() => setViewing(null)} />
      )}
    </div>
  )
}

function rank(status) { return status === 'approved' ? 3 : status === 'pending' ? 2 : status === 'rejected' ? 1 : 0 }

// "8 Jul 2026, 14:32" — shows the date and time the payment was made.
function fmtDateTime(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  return dt.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
