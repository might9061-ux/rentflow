// Arrears: how much a tenant still owes, including balance carried over from
// previous months. A tenant stays "in arrears" until their total reaches $0.

import { periodForDate, currentPeriod } from './billing.js'

const mk = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const DAY = 86400000
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

function paidSet(tenant, payments) {
  return new Set(
    payments.filter((p) => p.tenant_id === tenant.id && p.status === 'approved')
      .map((p) => (p.period_from || '').slice(0, 7))
  )
}

function startMonth(tenant) {
  const now = new Date()
  // Billing starts at the lease start when set; otherwise the month the tenant
  // was actually added. Never assume a fixed number of months back — that made a
  // brand-new tenant look months in arrears and inflated the "not paid" slice.
  const base = tenant.lease_start || tenant.created_at
  const s = base ? new Date(base) : now
  return new Date(s.getFullYear(), s.getMonth(), 1)
}

// { broughtForward, currentOwed, total, monthsBehind }
export function computeArrears(tenant, payments) {
  const rent = Number(tenant.rent || 0)
  const credit = Number(tenant.credit_balance || 0)
  const paid = paidSet(tenant, payments)
  const now = new Date()
  const curKey = mk(now)

  let d = startMonth(tenant)
  let broughtForward = 0
  let monthsBehind = 0
  let guard = 0
  while (mk(d) < curKey && guard < 240) {
    if (!paid.has(mk(d))) { broughtForward += rent; monthsBehind++ }
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    guard++
  }

  const currentPaid = tenant.status === 'paid' || paid.has(curKey)
  const currentOwed = currentPaid ? 0 : Math.max(0, rent - credit)
  if (currentOwed > 0) monthsBehind++

  return { broughtForward, currentOwed, total: broughtForward + currentOwed, monthsBehind }
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
export function computeAdvance(tenant) {
  const rent = Number(tenant.rent || 0)
  const credit = Number(tenant.credit_balance || 0)
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
  const rent = Number(tenant.rent || 0)
  const credit = Number(tenant.credit_balance || 0)
  const paid = paidSet(tenant, payments)
  const now = new Date()
  const curKey = mk(now)
  const lease = startMonth(tenant)

  // Never count months before the lease started — that's what inflated "not paid".
  let start = lease
  if (frame !== 'all') {
    const w = new Date(now.getFullYear(), now.getMonth() - (frame - 1), 1)
    if (w > lease) start = w
  }
  const startKey = mk(start)

  // Collected = real approved payments whose billed period falls in the window.
  const collected = payments
    .filter((p) => p.tenant_id === tenant.id && p.status === 'approved')
    .filter((p) => {
      const k = (p.period_from || p.paid_date || p.created_at || '').slice(0, 7)
      return k >= startKey && k <= curKey
    })
    .reduce((s, p) => s + Number(p.amount || 0), 0)

  // Not paid = rent for in-window months with no covering payment.
  let notPaid = 0
  let guard = 0
  let d = new Date(start.getFullYear(), start.getMonth(), 1)
  while (mk(d) <= curKey && guard < 600) {
    const isCur = mk(d) === curKey
    const covered = paid.has(mk(d)) || (isCur && (tenant.status === 'paid' || credit >= rent))
    if (!covered) notPaid += rent
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    guard++
  }
  return { collected, notPaid }
}

// The oldest unpaid billing period — what a fresh payment should be applied to.
export function oldestUnpaidPeriod(tenant, payments) {
  const paid = paidSet(tenant, payments)
  const now = new Date()
  const curKey = mk(now)
  let d = startMonth(tenant)
  let guard = 0
  while (mk(d) <= curKey && guard < 240) {
    if (!paid.has(mk(d))) return periodForDate(new Date(d), tenant.due_day || 1)
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    guard++
  }
  return currentPeriod(tenant.due_day || 1)
}
