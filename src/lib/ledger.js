// ═══════════════════════════════════════════════════════════════════════════
// Rent ledger — the single source of truth for coverage.
//
// Spreads a tenant's APPROVED payments across billing months in order, each
// month absorbing up to one month's rent and the remainder rolling forward.
// Derived entirely from the payment rows, so it stays correct no matter what
// the stored total_paid / credit_balance say. Used by both the tenant
// dashboard and the payment-history page so they can never disagree.
// ═══════════════════════════════════════════════════════════════════════════
import { periodForDate, currentPeriod, nextPeriod } from './billing.js'

const EPS = 0.001

export function buildLedger({ payments = [], rent = 0, dueDay = 1, startDate } = {}) {
  const cur = currentPeriod(dueDay)
  const curKey = cur.from.slice(0, 7)
  const startPeriod = startDate ? periodForDate(new Date(startDate), dueDay) : cur

  const approved = payments
    .filter((p) => p.status === 'approved')
    .sort((a, b) => new Date(a.created_at || a.paid_date || 0) - new Date(b.created_at || b.paid_date || 0))

  const pendingByKey = {}
  for (const p of payments) if (p.status === 'pending') {
    const k = (p.period_from || '').slice(0, 7)
    if (!pendingByKey[k]) pendingByKey[k] = p
  }

  // Billing periods from tenancy start forward.
  const cells = []
  { let p = startPeriod; for (let i = 0; i < 240; i++) { cells.push({ key: p.from.slice(0, 7), period: p, allocated: 0, pays: [] }); p = nextPeriod(p, dueDay) } }

  // Fill months in order from the payments.
  if (rent > 0) {
    let idx = 0
    for (const pay of approved) {
      let amt = Number(pay.amount) || 0
      while (amt > EPS && idx < cells.length) {
        const cell = cells[idx]
        const take = Math.min(amt, rent - cell.allocated)
        cell.allocated += take
        if (take > 0 && !cell.pays.includes(pay)) cell.pays.push(pay)
        amt -= take
        if (cell.allocated >= rent - EPS) idx++
      }
    }
  }

  const curIdx = Math.max(0, cells.findIndex((c) => c.key === curKey))
  const curCell = cells[curIdx]

  // Money allocated to periods AFTER the current one = advance credit.
  let creditAdvance = 0
  for (let i = curIdx + 1; i < cells.length; i++) creditAdvance += cells[i].allocated

  // Current month state.
  const currentStatus = rent <= 0 ? 'due'
    : curCell.allocated >= rent - EPS ? 'paid'
      : curCell.allocated > EPS ? 'partial' : 'due'
  const owedThisMonth = rent <= 0 ? 0 : Math.max(0, rent - curCell.allocated)

  // First period (from current forward) that isn't fully covered = next due.
  let nextDue = curCell.period
  for (let i = curIdx; i < cells.length; i++) {
    if (cells[i].allocated < rent - EPS) { nextDue = cells[i].period; break }
    if (i === cells.length - 1) nextDue = cells[i].period
  }
  // Whole future months fully covered by advance.
  let monthsAhead = 0
  for (let i = curIdx + 1; i < cells.length; i++) { if (cells[i].allocated >= rent - EPS) monthsAhead++; else break }

  return { cells, curKey, curIdx, curCell, creditAdvance, currentStatus, owedThisMonth, nextDue, monthsAhead, pendingByKey }
}
