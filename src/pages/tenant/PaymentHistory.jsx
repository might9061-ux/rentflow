import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { db } from '../../lib/db.js'
import { money, monthYear } from '../../lib/format.js'
import { buildLedger } from '../../lib/ledger.js'
import { Spinner } from '../../components/ui.jsx'
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
      <div className="card" style={{ overflow: 'hidden' }}>
        {months.map((m) => {
          const rent = Number(t?.rent || 0)
          const pay = m.pays.length ? m.pays[m.pays.length - 1] : null // most recent contributor
          const method = methodLabel(m.pays) || (m.pending ? m.pending.method : null)
          const timeSrc = pay?.created_at || pay?.paid_date
          const advance = m.kind === 'advance' || m.kind === 'advance_partial'
          const overdue = m.kind === 'overdue' || m.kind === 'overdue_partial'
          const partial = m.kind === 'partial' || m.kind === 'advance_partial' || m.kind === 'overdue_partial'
          const blank = m.kind === 'not_paid' || m.kind === 'overdue' // no amount to show
          const amount = m.kind === 'pending' ? Number(m.pending.amount) : m.allocated

          const dot = overdue ? 'var(--danger)'
            : m.kind === 'pending' ? 'var(--warn)'
            : advance || partial ? 'var(--gold)'
            : m.kind === 'paid' ? 'var(--green)' : 'var(--line)'
          const status = overdue ? <span style={{ color: 'var(--danger)' }}>overdue — owes {money(rent - m.allocated)}</span>
            : m.kind === 'pending' ? <span style={{ color: 'var(--warn)' }}>awaiting approval</span>
            : advance ? (partial ? `advance — ${money(amount)} of ${money(rent)}` : 'paid in advance')
            : partial ? `partial — of ${money(rent)}`
            : m.kind === 'paid' ? 'paid in full' : 'not paid yet'

          return (
            <div key={m.key} className={`tph-row ${pay ? 'click' : ''}`}
              onClick={pay ? () => setViewing(pay) : undefined}
              role={pay ? 'button' : undefined} tabIndex={pay ? 0 : undefined}
              onKeyDown={pay ? (e) => { if (e.key === 'Enter') setViewing(pay) } : undefined}>
              <span className="tph-dot" style={{ background: dot }} />
              <div className="tph-main">
                <div className="tph-name">{monthYear(m.period.from, true)} <span className="muted" style={{ fontWeight: 400 }}>· {monthYear(m.period.from)} → {monthYear(m.period.to)}</span></div>
                <div className="muted tph-sub">{status}{method ? ` · ${method}` : ''}{timeSrc && !blank ? ` · ${fmtDateTime(timeSrc)}` : ''}</div>
              </div>
              <div className="tph-side">
                <span className="mono" style={{ fontWeight: 600, fontSize: '0.9rem', color: overdue ? 'var(--danger)' : m.kind === 'paid' || advance ? 'var(--green)' : 'inherit' }}>
                  {blank ? '—' : money(amount)}
                </span>
                {pay && <span className="tph-go"><IconReceipt size={13} /> Receipt</span>}
              </div>
            </div>
          )
        })}
      </div>
      ) : (
      <div className="card" style={{ overflow: 'hidden' }}>
        {payments.length === 0 ? (
          <div style={{ padding: 18 }}><span className="faint">No payments yet.</span></div>
        ) : (
          [...payments]
            .sort((a, b) => new Date(b.created_at || b.paid_date || 0) - new Date(a.created_at || a.paid_date || 0))
            .map((p) => {
              const approved = p.status === 'approved'
              const rejected = p.status === 'rejected'
              const ref = p.reference ? `ref …${String(p.reference).slice(-8)}` : null
              return (
                <div key={p.id} className={`tph-row ${approved ? 'click' : ''}`}
                  onClick={approved ? () => setViewing(p) : undefined}
                  role={approved ? 'button' : undefined} tabIndex={approved ? 0 : undefined}
                  onKeyDown={approved ? (e) => { if (e.key === 'Enter') setViewing(p) } : undefined}>
                  <span className="tph-dot" style={{ background: approved ? 'var(--green)' : rejected ? 'var(--danger)' : 'var(--warn)' }} />
                  <div className="tph-main">
                    <div className="tph-name">{money(p.amount)} <span className="muted" style={{ fontWeight: 400 }}>· {p.method || '—'} · {monthYear(p.period_from)} → {monthYear(p.period_to)}</span></div>
                    <div className="muted tph-sub">
                      {fmtDateTime(p.created_at || p.paid_date)}{ref ? ` · ${ref}` : ''}
                      {!approved && !rejected && <span style={{ color: 'var(--warn)' }}> · awaiting manager approval</span>}
                      {rejected && <span style={{ color: 'var(--danger)' }}> · rejected</span>}
                    </div>
                  </div>
                  {approved
                    ? <span className="tph-go"><IconReceipt size={13} /> Receipt</span>
                    : <span className="muted" style={{ fontSize: '0.76rem' }}>{rejected ? 'Rejected' : 'Pending'}</span>}
                </div>
              )
            })
        )}
      </div>
      )}

      <style>{`
        .tph-row { display: flex; align-items: center; gap: 11px; padding: 12px 16px; border-bottom: 1px solid var(--line-soft); }
        .tph-row:last-child { border-bottom: none; }
        .tph-row.click { cursor: pointer; transition: background 0.13s; }
        .tph-row.click:hover { background: var(--accent-bg); }
        .tph-row.click:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--accent); }
        .tph-dot { width: 9px; height: 9px; border-radius: 99px; flex-shrink: 0; }
        .tph-main { flex: 1; min-width: 0; }
        .tph-name { font-weight: 600; font-size: 0.92rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tph-sub { font-size: 0.78rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tph-side { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }
        .tph-go { display: inline-flex; align-items: center; gap: 4px; font-size: 0.76rem; color: var(--accent); white-space: nowrap; }
        @media (max-width: 560px) {
          .tph-sub { white-space: normal; }
        }
      `}</style>

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
