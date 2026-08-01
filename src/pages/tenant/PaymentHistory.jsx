import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { db } from '../../lib/db.js'
import { money, monthYear } from '../../lib/format.js'
import { buildLedger } from '../../lib/ledger.js'
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
  const [view, setView] = useState('payments') // 'payments' (raw list, default) | 'monthly' (ledger)
  const [viewing, setViewing] = useState(null)

  useEffect(() => {
    let alive = true
    // Fresh tenant record too, so credit_balance (→ advance months) is current.
    const fetchAll = async () => {
      const [pays, mgr, me] = await Promise.all([
        db.listTenantPayments(userId), db.getTenantManager(userId), db.getTenant(userId),
      ])
      if (!alive) return
      setPayments(pays); setManager(mgr); setTenant(me); setLoading(false)
    }
    (async () => {
      await fetchAll()
      // Self-heal abandoned online payments (e.g. tenant hit Back at checkout):
      // re-check them with the gateway in the background, then refresh if any changed.
      try { const { changed } = await db.reconcilePayments(); if (changed && alive) await fetchAll() } catch { /* non-blocking */ }
    })()
    return () => { alive = false }
  }, [userId])

  const t = tenant || profile

  // Rent LEDGER: spread every approved payment across billing months in order,
  // each month absorbing up to one month's rent, the remainder rolling to the
  // next month. This is derived straight from the payments, so it stays correct
  // regardless of the stored totals. e.g. $1400 @ $500 → Jul 500, Aug 500,
  // Sep 400 (partial). Future covered months show as "Advance".
  const months = useMemo(() => {
    const dueDay = t?.due_day || 1
    const rent = Number(t?.rent || 0)
    const { cells, curKey, curIdx, pendingByKey } = buildLedger({ payments, rent, dueDay, startDate: t?.lease_start || t?.created_at })
    let lastAlloc = curIdx
    cells.forEach((c, i) => { if (c.allocated > 0.001 || pendingByKey[c.key]) lastAlloc = Math.max(lastAlloc, i) })
    const startIdx = Math.max(0, curIdx - range + 1)

    const rows = []
    for (let i = lastAlloc; i >= startIdx; i--) {
      const cell = cells[i]
      const isFuture = cell.key > curKey
      const isPast = cell.key < curKey
      let kind
      if (rent > 0 && cell.allocated >= rent - 0.001) kind = isFuture ? 'advance' : 'paid'
      else if (cell.allocated > 0.001) kind = isFuture ? 'advance_partial' : (isPast ? 'overdue_partial' : 'partial')
      else if (pendingByKey[cell.key]) kind = 'pending'
      else if (isFuture) continue
      else kind = isPast ? 'overdue' : 'not_paid' // past unpaid = overdue; current unpaid = not paid yet
      rows.push({ ...cell, isFuture, kind, pending: pendingByKey[cell.key] || null })
    }
    return rows
  }, [payments, range, t])

  if (loading) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>

  return (
    <div className="page">
      <div className="spread page-head">
        <div>
          <div className="eyebrow">Records</div>
          <h1>Payment history</h1>
          <p>{view === 'monthly' ? 'Your rent status month by month.' : 'Every payment you’ve made, most recent first.'}</p>
        </div>
        <div className="row gap wrap">
          <div className="seg">
            <button className={view === 'monthly' ? 'on' : ''} onClick={() => setView('monthly')}>By month</button>
            <button className={view === 'payments' ? 'on' : ''} onClick={() => setView('payments')}>Payments</button>
          </div>
          {view === 'monthly' && (
            <div className="seg">
              <button className={range === 12 ? 'on' : ''} onClick={() => setRange(12)}>12 months</button>
              <button className={range === 60 ? 'on' : ''} onClick={() => setRange(60)}>5 years</button>
            </div>
          )}
        </div>
      </div>

      {view === 'monthly' ? (
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Month</th><th>Billing period</th><th>Status</th><th>Amount</th><th>Method</th><th>Receipt</th></tr></thead>
          <tbody>
            {months.map((m) => {
              const rent = Number(t?.rent || 0)
              const pay = m.pays.length ? m.pays[m.pays.length - 1] : null // most recent contributor
              const method = methodLabel(m.pays) || (m.pending ? m.pending.method : null)
              const timeSrc = pay?.created_at || pay?.paid_date
              const clickable = !!pay
              const advance = m.kind === 'advance' || m.kind === 'advance_partial'
              const overdue = m.kind === 'overdue' || m.kind === 'overdue_partial'
              const partial = m.kind === 'partial' || m.kind === 'advance_partial' || m.kind === 'overdue_partial'
              const blank = m.kind === 'not_paid' || m.kind === 'overdue' // no amount to show
              const amount = m.kind === 'pending' ? Number(m.pending.amount) : m.allocated

              const pill = overdue
                ? <StatusPill status="overdue" />
                : advance
                  ? <span className="pill" style={{ background: 'var(--gold-bg)', border: '1px solid var(--gold-line)', color: 'var(--gold)' }}>● {partial ? 'Advance (part)' : 'Advance'}</span>
                  : m.kind === 'partial'
                    ? <span className="pill" style={{ background: 'var(--gold-bg)', border: '1px solid var(--gold-line)', color: 'var(--gold)' }}>● Partial</span>
                    : <StatusPill status={m.kind === 'paid' ? 'paid' : m.kind === 'pending' ? 'pending' : 'not_paid'} />

              return (
                <tr key={m.key} className={clickable ? 'clickable-row' : ''} onClick={clickable ? () => setViewing(pay) : undefined}>
                  <td style={{ fontWeight: 600 }}>{monthYear(m.period.from, true)}</td>
                  <td><PeriodTag period={m.period} /></td>
                  <td>{pill}</td>
                  <td className="mono">
                    {blank ? <span className="faint">—</span> : money(amount)}
                    {partial && <div className="muted" style={{ fontSize: '0.72rem', fontWeight: 400 }}>of {money(rent)}{advance ? ' · in advance' : ''}</div>}
                    {overdue && <div style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--danger)' }}>owes {money(rent - m.allocated)}</div>}
                    {m.kind === 'advance' && <div className="muted" style={{ fontSize: '0.72rem', fontWeight: 400 }}>paid in advance</div>}
                    {timeSrc && !blank && <div className="muted" style={{ fontSize: '0.72rem', fontWeight: 400 }}>{fmtDateTime(timeSrc)}</div>}
                  </td>
                  <td>{blank && !method ? <span className="faint">—</span> : (method || <span className="faint">—</span>)}</td>
                  <td>
                    {pay
                      ? <button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); setViewing(pay) }}><IconReceipt size={14} /> Receipt</button>
                      : <span className="faint">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      ) : (
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Date &amp; time</th><th>Amount</th><th>Method</th><th>Reference</th><th>For period</th><th>Status</th><th>Receipt</th></tr></thead>
          <tbody>
            {payments.length === 0 ? (
              <tr><td colSpan={7}><span className="faint">No payments yet.</span></td></tr>
            ) : (
              [...payments]
                .sort((a, b) => new Date(b.created_at || b.paid_date || 0) - new Date(a.created_at || a.paid_date || 0))
                .map((p) => {
                  const approved = p.status === 'approved'
                  return (
                    <tr key={p.id} className={approved ? 'clickable-row' : ''} onClick={approved ? () => setViewing(p) : undefined}>
                      <td className="nowrap">{fmtDateTime(p.created_at || p.paid_date)}</td>
                      <td className="mono" style={{ fontWeight: 600 }}>{money(p.amount)}</td>
                      <td>{p.method || <span className="faint">—</span>}</td>
                      <td className="muted mono" style={{ fontSize: '0.8rem' }}>{p.reference || <span className="faint">—</span>}</td>
                      <td><PeriodTag from={p.period_from} to={p.period_to} /></td>
                      <td><StatusPill status={approved ? 'paid' : p.status} /></td>
                      <td>
                        {approved
                          ? <button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); setViewing(p) }}><IconReceipt size={14} /> Receipt</button>
                          : <span className="faint">—</span>}
                      </td>
                    </tr>
                  )
                })
            )}
          </tbody>
        </table>
      </div>
      )}

      {viewing && (
        <ReceiptModal payment={viewing} tenant={profile} manager={manager} property={property} payments={payments}
          onClose={() => setViewing(null)} />
      )}
    </div>
  )
}

// Distinct payment method(s) that filled a month: one name, or "Multiple".
function methodLabel(pays) {
  if (!pays || !pays.length) return null
  const methods = [...new Set(pays.map((p) => p.method).filter(Boolean))]
  return methods.length <= 1 ? (methods[0] || null) : 'Multiple'
}

// "8 Jul 2026, 14:32" — shows the date and time the payment was made.
function fmtDateTime(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  return dt.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
