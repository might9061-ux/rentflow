// Shared time-frame helpers for the admin views.

export const PERIODS = [
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'this_year', label: 'This year' },
  { id: 'all', label: 'All time' },
]

export function periodLabel(id) { return PERIODS.find((p) => p.id === id)?.label || id }

export function rangeFor(id, now = new Date()) {
  if (id === 'this_month') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: null }
  if (id === 'last_month') return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 1) }
  if (id === 'this_year') return { from: new Date(now.getFullYear(), 0, 1), to: null }
  return { from: null, to: null }
}

export function inRange(dateStr, { from, to }) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (from && d < from) return false
  if (to && d >= to) return false
  return true
}

// A whole calendar month, `offset` months back (0 = this month).
export function monthRange(offset = 0, now = new Date()) {
  return {
    from: new Date(now.getFullYear(), now.getMonth() - offset, 1),
    to: new Date(now.getFullYear(), now.getMonth() - offset + 1, 1),
  }
}

// Sum a metric over rows whose date falls in a range.
export function sumIn(rows, range, dateKey, valueKey) {
  return rows.reduce((s, r) => (inRange(r[dateKey], range) ? s + (Number(r[valueKey]) || 0) : s), 0)
}

// This-month vs last-month delta as a signed percentage (null if no prior data).
export function deltaPct(prev, curr) {
  if (!prev) return curr > 0 ? 100 : 0
  return Math.round(((curr - prev) / prev) * 100)
}
