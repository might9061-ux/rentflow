// ═══════════════════════════════════════════════════════════════════════════
// Billing periods & advance-payment / credit logic.
//
// A billing PERIOD is always shown as a range, e.g. "May 2026 → Jun 2026".
// Each payment stores period_from / period_to.
// ═══════════════════════════════════════════════════════════════════════════

import { monthYear, money } from './format.js'

// The period that "contains" a given date, anchored on the tenant's due_day.
// period_from = due_day of that month; period_to = due_day of the next month.
export function periodForDate(date, dueDay = 1) {
  const d = new Date(date)
  const day = clampDay(dueDay, d.getFullYear(), d.getMonth())
  let from
  if (d.getDate() >= day) {
    from = new Date(d.getFullYear(), d.getMonth(), day)
  } else {
    from = new Date(d.getFullYear(), d.getMonth() - 1, clampDay(dueDay, d.getFullYear(), d.getMonth() - 1))
  }
  return periodFrom(from, dueDay)
}

// Build a {from,to} period starting at a given "from" date.
export function periodFrom(fromDate, dueDay = 1) {
  const from = new Date(fromDate)
  const to = new Date(from.getFullYear(), from.getMonth() + 1, clampDay(dueDay, from.getFullYear(), from.getMonth() + 1))
  return { from: iso(from), to: iso(to) }
}

// The period immediately after a given period.
export function nextPeriod(period, dueDay = 1) {
  return periodFrom(new Date(period.to), dueDay)
}

export function currentPeriod(dueDay = 1) {
  return periodForDate(new Date(), dueDay)
}

// "May 2026 → Jun 2026"
export function formatPeriod(period) {
  if (!period?.from || !period?.to) return '—'
  return `${monthYear(period.from)} → ${monthYear(period.to)}`
}

export function periodKey(period) {
  return `${period.from}__${period.to}`
}

// ── Advance / credit calculation ───────────────────────────────────────────
// Given the tenant's rent, their existing credit balance, and a new payment
// amount, compute how the funds settle the current cycle and what rolls
// forward as credit.
//
// Returns:
//   coversCurrent : boolean — is this month's rent now fully covered?
//   newCredit     : number  — credit balance carried to next month
//   owedNextNote  : string  — human note for the dashboard banner
export function applyPayment({ rent, creditBalance = 0, amount }) {
  const pool = Number(creditBalance) + Number(amount)
  const newCredit = Math.max(0, pool - Number(rent))
  const coversCurrent = pool >= Number(rent)
  const isAdvance = newCredit > 0

  let owedNextNote
  if (newCredit >= rent) {
    owedNextNote = 'Next month fully covered'
  } else if (newCredit > 0) {
    owedNextNote = `${money(rent - newCredit)} still owed next month`
  } else {
    owedNextNote = ''
  }

  return { coversCurrent, newCredit, isAdvance, owedNextNote }
}

// Preview of where a fresh payment lands, given current paid state — used by
// the tenant Submit Payment form to tell them in advance.
export function previewPayment({ rent, creditBalance = 0, amount, currentPaid }) {
  // If the current period is already covered, the new money targets next month.
  const baseCredit = currentPaid ? Number(creditBalance) : Number(creditBalance)
  const res = applyPayment({ rent, creditBalance: baseCredit, amount })
  return {
    ...res,
    appliesTo: currentPaid ? 'next' : 'current',
  }
}

// ── small utils ────────────────────────────────────────────────────────────
function clampDay(day, year, month) {
  const last = new Date(year, month + 1, 0).getDate()
  return Math.min(Math.max(1, day), last)
}
function iso(d) {
  // Format from LOCAL date parts — using toISOString() converts to UTC, which
  // shifts a local-midnight 1st-of-month back into the previous month.
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
export const PAYMENT_METHODS = ['Cash USD', 'EcoCash', 'InnBucks', 'Bank Transfer', 'Mukuru']
