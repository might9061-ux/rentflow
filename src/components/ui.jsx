// Small presentational primitives: StatCard, StatusPill, PeriodTag, Spinner,
// EmptyState, CountBadge.
import { formatPeriod } from '../lib/billing.js'

export function StatCard({ label, value, sub, icon, onClick }) {
  const clickable = typeof onClick === 'function'
  return (
    <div className={`stat ${clickable ? 'clickable' : ''}`}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}>
      <div className="spread">
        <span className="stat-label">{label}</span>
        {icon && <span style={{ color: 'var(--accent)', opacity: 0.85 }}>{icon}</span>}
      </div>
      <div className="stat-value mono">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      {clickable && <span className="stat-go">View ›</span>}
    </div>
  )
}

const STATUS_MAP = {
  paid:     { cls: 'ok',       label: 'Paid' },
  due:      { cls: 'due',      label: 'Due' },
  overdue:  { cls: 'overdue',  label: 'Overdue' },
  pending:  { cls: 'pending',  label: 'Pending' },
  rejected: { cls: 'rejected', label: 'Rejected' },
  approved: { cls: 'ok',       label: 'Approved' },
  active:   { cls: 'ok',       label: 'Active' },
  inactive: { cls: 'neutral',  label: 'Inactive' },
  not_paid: { cls: 'neutral',  label: 'Not Paid' },
  pending_verification: { cls: 'pending', label: 'Unverified' },
  suspended: { cls: 'rejected', label: 'Suspended' },
}

export function StatusPill({ status, label }) {
  const m = STATUS_MAP[status] || { cls: 'neutral', label: label || status || '—' }
  return <span className={`pill ${m.cls}`}><span className="dot" />{label || m.label}</span>
}

export function PeriodTag({ from, to, period }) {
  const p = period || { from, to }
  const label = formatPeriod(p)
  const [a, b] = label.split(' → ')
  return (
    <span className="tag-period">
      <b>{a}</b><span className="arrow">→</span><b>{b}</b>
    </span>
  )
}

export function CountBadge({ n }) {
  if (!n) return null
  return <span className="count-badge">{n > 99 ? '99+' : n}</span>
}

export function Spinner() { return <div className="spinner" /> }

export function LoadingScreen() {
  return <div className="loading-screen"><Spinner /></div>
}

export function EmptyState({ icon = '◌', title, children }) {
  return (
    <div className="empty-state">
      <div className="es-ico">{icon}</div>
      <h3 style={{ fontFamily: 'var(--sans)', fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
      {children && <p className="muted" style={{ marginTop: 4 }}>{children}</p>}
    </div>
  )
}
