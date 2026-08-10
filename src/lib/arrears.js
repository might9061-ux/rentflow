// Arrears & advance — how much a tenant still owes (including balance carried
// over from previous months) and how far ahead a prepaid tenant is.
//
// Everything here is DERIVED from the rent ledger (src/lib/ledger.js), the
// single source of truth: it spreads approved payment rows across billing
// months instead of trusting the stored credit_balance / status columns. That
// keeps the Arrears page, reminders and the AI assistant in lock-step with the
// dashboard and each tenant's own screen — and makes a partial payment reduce
// the balance instead of marking the whole month paid (the old inflation bug).

import { currentPeriod } from './billing.js'
import { tenantLedger } from './ledger.js'

const mk = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const DAY = 86400000
const EPS = 0.001
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

// Late fee owed by a tenant, per the manager's policy. Charged only when the
// tenant is in arrears AND past the grace period after the due date.
//   late_fee_type: 'flat' → fixed amount; 'percent' → % of monthly rent.
export function lateFeeFor(tenant, manager, payments, today = new Date()) {
  if (!manager?.late_fee_enabled || tenant.account_status !== 'active') return 0
  if (computeArrears(tenant, payments).total <= 0) return 0
  const dueDate = startOfDay(currentPeriod(Number(tenant.due_day) || 1).from)
  const daysOverdue = Math.floor((startOfDay(today) - dueDate) / DAY)
  if (daysOverdue <= Number(manager.late_fee_grace_days || 0)) return 0
  const amt = Number(manager.late_fee_amount || 0)
  const fee = manager.late_fee_type === 'percent' ? (Number(tenant.rent || 0) * amt) / 100 : amt
  return Math.round(fee * 100) / 100
}

// { broughtForward, currentOwed, total, monthsBehind }
export function computeArrears(tenant, payments) {
  const led = tenantLedger(tenant, payments)
  const currentOwed = led.owedThisMonth
  return {
    broughtForward: led.overdueAmount,
    currentOwed,
    total: led.totalOwed,
    monthsBehind: led.overdueMonths + (currentOwed > EPS ? 1 : 0),
  }
}

// Advance / prepaid coverage: a tenant has paid beyond the current month and is
// carrying credit. We translate that credit into "how long it lasts":
//   rent $300, credit $400  →  1 full month ahead + $100 (33%) toward the next.
// Counting the already-paid current month, that money "covers" 2 months total.
//
// Returns:
//   credit        : number  — credit balance carried forward
//   fullMonths    : number  — whole future months fully covered by credit
//   monthsCovered : number  — fullMonths + the current (paid) month
//   partialAmount : number  — leftover applied to the month after that
//   partialPct    : number  — that leftover as a % of one month's rent
//   coveredThrough: ISO     — first day of the last FULLY-covered month
//   partialMonth  : ISO     — first day of the partially-covered month (or null)
//   hasAdvance    : boolean
export function computeAdvance(tenant, payments = []) {
  const rent = Number(tenant.rent || 0)
  // Advance credit is the money the ledger allocated to periods AFTER the
  // current one — not the stored credit_balance, which can drift from reality.
  const credit = tenantLedger(tenant, payments).creditAdvance
  if (rent <= 0 || credit <= 0) {
    return { credit, fullMonths: 0, monthsCovered: 0, partialAmount: 0, partialPct: 0, coveredThrough: null, partialMonth: null, hasAdvance: false }
  }
  const fullMonths = Math.floor(credit / rent)
  const partialAmount = Math.round((credit - fullMonths * rent) * 100) / 100
  const partialPct = Math.round((partialAmount / rent) * 100)

  // First-of-month ISO from LOCAL parts (Date normalizes month overflow) —
  // toISOString() would shift to UTC and pull a local-midnight 1st back into
  // the previous month.
  const now = new Date()
  const monthIso = (offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  }
  const coveredThrough = monthIso(fullMonths)
  const partialMonth = partialAmount > 0 ? monthIso(fullMonths + 1) : null

  return {
    credit,
    fullMonths,
    monthsCovered: fullMonths + 1,
    partialAmount,
    partialPct,
    coveredThrough,
    partialMonth,
    hasAdvance: true,
  }
}

// Rent collection for a time window:
//   collected — ACTUAL money received (approved payments billed to a month in
//               the window). This is real cash, so summed across tenants for the
//               "All" frame it equals the dashboard's "Total collected" stat.
//   notPaid   — rent for months in the window with no covering payment (what's
//               still owed).
//
// Consistent across frames: widening the window only ADDS older months and their
// payments, so a paid month never flips to unpaid (fixing the old bug where
// "12M" and "All" disagreed).
//
//   frame = a number of months, or 'all'
//   returns { collected, notPaid }
export function collectionBreakdown(tenant, payments, frame) {
  const led = tenantLedger(tenant, payments)
  const rent = Number(tenant.rent || 0)
  const now = new Date()
  const curKey = led.curKey
  // The lease-start month is the first ledger cell — never count months before it.
  const leaseKey = led.cells[0]?.key || mk(now)

  let startKey = leaseKey
  if (frame !== 'all') {
    const wKey = mk(new Date(now.getFullYear(), now.getMonth() - (frame - 1), 1))
    if (wKey > leaseKey) startKey = wKey
  }

  // Collected = real approved payments whose billed period falls in the window.
  const collected = payments
    .filter((p) => p.tenant_id === tenant.id && p.status === 'approved')
    .filter((p) => {
      const k = (p.period_from || p.paid_date || p.created_at || '').slice(0, 7)
      return k >= startKey && k <= curKey
    })
    .reduce((s, p) => s + Number(p.amount || 0), 0)

  // Not paid = the shortfall (rent minus what the ledger actually allocated) for
  // each in-window month. A partial payment shrinks the slice; it no longer
  // flips the whole month to "paid".
  let notPaid = 0
  for (const cell of led.cells) {
    if (cell.key < startKey) continue
    if (cell.key > curKey) break
    if (rent > 0) notPaid += Math.max(0, rent - cell.allocated)
  }
  return { collected, notPaid }
}

// The oldest unpaid (or partially-paid) billing period — what a fresh payment
// should be applied to. Derived from the ledger so a half-covered month is still
// picked up instead of being skipped as "paid".
export function oldestUnpaidPeriod(tenant, payments) {
  const led = tenantLedger(tenant, payments)
  const rent = Number(tenant.rent || 0)
  if (rent > 0) {
    for (const cell of led.cells) {
      if (cell.key > led.curKey) break
      if (cell.allocated < rent - EPS) return cell.period
    }
  }
  return currentPeriod(tenant.due_day || 1)
}
