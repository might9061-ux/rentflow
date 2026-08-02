// Status of a manager's OWN RentLoja subscription installment — drives the
// automatic "your subscription is due" reminder. Derived from the plan + the
// last subscription payment, so no scheduler is needed: it simply shows whenever
// the manager opens the app while a payment is due.

// Months in a yearly plan (charge = monthly price × this).
export const YEARLY_MONTHS = 12

// The next installment date after `from`, a month (or a year) on, clamped to the
// month's length.
function nextRenewal(from, cycle) {
  const d = new Date(from || Date.now())
  const step = cycle === 'yearly' ? 12 : 1
  const lastDay = new Date(d.getFullYear(), d.getMonth() + step + 1, 0).getDate()
  return new Date(d.getFullYear(), d.getMonth() + step, Math.min(d.getDate(), lastDay))
}

// The amount charged per installment for the chosen cycle.
export function installmentAmount(monthlyPrice, cycle) {
  return cycle === 'yearly' ? Number(monthlyPrice || 0) * YEARLY_MONTHS : Number(monthlyPrice || 0)
}

// Returns { state, dueDate, days, price, cycle }.
//   state: 'none' | 'ok' | 'due-soon' | 'overdue' | 'canceled'
export function subscriptionStatus(manager, subPays = []) {
  if (!manager?.plan_active) return { state: 'none' }
  const now = new Date()
  const cycle = manager.plan_cycle === 'yearly' ? 'yearly' : 'monthly'
  const onTrial = manager.trial_ends_at && new Date(manager.trial_ends_at) > now
  // Only APPROVED installments count — a pending/abandoned gateway attempt must
  // never look like a payment.
  const approved = (subPays || []).filter((p) => (p.status || 'approved') === 'approved')
  const lastPaid = approved[0]?.created_at || manager.plan_started_at
  const dueDate = onTrial ? new Date(manager.trial_ends_at) : nextRenewal(lastPaid, cycle)
  const days = Math.ceil((dueDate - now) / 86400000)
  const price = installmentAmount(manager.plan_price, cycle)
  if (manager.plan_canceled_at) return { state: 'canceled', dueDate, days, price, cycle }
  if (days < 0) return { state: 'overdue', dueDate, days, price, cycle }
  if (days <= 5) return { state: 'due-soon', dueDate, days, price, cycle }
  return { state: 'ok', dueDate, days, price, cycle }
}
