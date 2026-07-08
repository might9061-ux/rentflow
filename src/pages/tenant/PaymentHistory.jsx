import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { db } from '../../lib/db.js'
import { money, monthYear } from '../../lib/format.js'
import { periodForDate, currentPeriod, nextPeriod, formatPeriod } from '../../lib/billing.js'
import { StatusPill, PeriodTag, Spinner } from '../../components/ui.jsx'
import ReceiptModal from '../../components/Receipt.jsx'
import { IconReceipt } from '../../components/icons.jsx'

export default function PaymentHistory() {
  const { userId, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [payments, setPayments] = useState([])
  const [manager, setManager] = useState(null)
  const [property, setProperty] = useState(null)
  const [tenant, setTenant] = useState(null)
  const [range, setRange] = useState(12) // 12 months | 60 months (5 years)
  const [viewing, setViewing] = useState(null)

  useEffect(() => {
    (async () => {
      // Fresh tenant record too, so credit_balance (→ advance months) is current.
      const [pays, mgr, me] = await Promise.all([
        db.listTenantPayments(userId), db.getTenantManager(userId), db.getTenant(userId),
      ])
      setPayments(pays); setManager(mgr); setTenant(me)
      setLoading(false)
    })()
  }, [userId])

  const t = tenant || profile

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

  // Build the month timeline. Past→current from real payments (never earlier
  // than the tenancy began). PLUS upcoming months already covered by the
  // tenant's credit balance, shown as "Advance" — these flip to "Paid (from
  // credit)" once that month becomes the current period.
  const months = useMemo(() => {
    const dueDay = t?.due_day || 1
    const rent = Number(t?.rent || 0)
    const credit = Number(t?.credit_balance || 0)
    const creditMonths = rent > 0 ? Math.floor(credit / rent) : 0
    const curKey = currentPeriod(dueDay).from.slice(0, 7)

    // Walk forward from the current period; credit covers upcoming periods that
    // don't already have a real approved payment.
    const coveredFuture = []          // periods AFTER current, covered by credit
    const coveredNow = new Set()      // current/past keys covered by credit (no payment)
    {
      let p = currentPeriod(dueDay), rem = creditMonths, guard = 0
      while (rem > 0 && guard < 120) {
        const key = p.from.slice(0, 7)
        const pay = byPeriod[key]
        if (!(pay && pay.status === 'approved')) {
          if (key > curKey) coveredFuture.push({ key, period: p }); else coveredNow.add(key)
          rem--
        }
        p = nextPeriod(p, dueDay); guard++
      }
    }

    // Future advance rows — furthest month on top.
    const advanceRows = coveredFuture
      .sort((a, b) => b.key.localeCompare(a.key))
      .map((c) => ({ key: c.key, period: c.period, payment: null, kind: 'advance' }))

    // Past → current rows, stopping at the tenancy start.
    const startSrc = t?.lease_start || t?.created_at
    let startKey = startSrc ? periodForDate(new Date(startSrc), dueDay).from.slice(0, 7) : '0000-00'
    if (startKey > curKey) startKey = curKey
    const historyRows = []
    let period = currentPeriod(dueDay)
    for (let i = 0; i < range; i++) {
      const key = period.from.slice(0, 7)
      if (key < startKey) break
      const payment = byPeriod[key] || null
      const kind = !payment && coveredNow.has(key) ? 'credit' : null
      historyRows.push({ key, period, payment, kind })
      const prevAnchor = new Date(new Date(period.from).getTime() - 86400000)
      period = periodForDate(prevAnchor, dueDay)
    }

    return [...advanceRows, ...historyRows]
  }, [range, byPeriod, t])

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
              const rent = Number(t?.rent || 0)
              // Upcoming month covered by credit → "Advance".
              if (m.kind === 'advance') {
                return (
                  <tr key={m.key}>
                    <td style={{ fontWeight: 600 }}>{monthYear(m.period.from, true)}</td>
                    <td><PeriodTag period={m.period} /></td>
                    <td><span className="pill" style={{ background: 'var(--gold-bg)', border: '1px solid var(--gold-line)', color: 'var(--gold)' }}>● Advance</span></td>
                    <td className="mono">{money(rent)}<div className="muted" style={{ fontSize: '0.72rem', fontWeight: 400 }}>paid in advance</div></td>
                    <td>Credit balance</td>
                    <td><span className="faint">—</span></td>
                  </tr>
                )
              }
              // Current/past month with no payment but covered by credit → Paid (from credit).
              if (m.kind === 'credit') {
                return (
                  <tr key={m.key}>
                    <td style={{ fontWeight: 600 }}>{monthYear(m.period.from, true)}</td>
                    <td><PeriodTag period={m.period} /></td>
                    <td><StatusPill status="paid" /></td>
                    <td className="mono">{money(rent)}<div className="muted" style={{ fontSize: '0.72rem', fontWeight: 400 }}>from credit</div></td>
                    <td>Credit balance</td>
                    <td><span className="faint">—</span></td>
                  </tr>
                )
              }
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
