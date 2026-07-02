// ── Money & date formatting helpers ─────────────────────────────────────────
// The active currency is set once per session from the workspace's country
// (see setActiveCurrency, called by AuthContext / TenantLayout). Defaults to USD.

let _currency = { symbol: '$', locale: 'en-US', decimals: 2 }
export function setActiveCurrency(c) { if (c) _currency = c }
export function activeCurrency() { return _currency }

export function money(n, { sign = true } = {}) {
  const v = Number(n || 0)
  const s = v.toLocaleString(_currency.locale, { minimumFractionDigits: _currency.decimals, maximumFractionDigits: _currency.decimals })
  return sign ? `${_currency.symbol}${s}` : s
}

export function initials(first = '', last = '') {
  return ((first[0] || '') + (last[0] || '')).toUpperCase() || '·'
}

export function fullName(p) {
  if (!p) return ''
  return `${p.first_name || ''} ${p.last_name || ''}`.trim()
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export function fmtDate(d) {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date)) return '—'
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

export function monthYear(d, long = false) {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date)) return '—'
  return `${(long ? MONTHS_LONG : MONTHS)[date.getMonth()]} ${date.getFullYear()}`
}

export function timeAgo(d) {
  if (!d) return ''
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d ago`
  return fmtDate(d)
}

// Basic but strict email-format check (one @, a dot in the domain, no spaces).
export function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((s || '').trim())
}

// Privacy-masked email: r•••o@example.com
export function maskEmail(email) {
  if (!email || !email.includes('@')) return email || '—'
  const [user, domain] = email.split('@')
  const masked = user.length <= 2
    ? user[0] + '•'
    : user[0] + '•'.repeat(Math.max(1, user.length - 2)) + user[user.length - 1]
  return `${masked}@${domain}`
}

export function uid() {
  return (crypto?.randomUUID?.() || 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36))
}
