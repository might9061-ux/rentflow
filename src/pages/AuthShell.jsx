import { Link } from 'react-router-dom'
import { IconArrowRight } from '../components/icons.jsx'

// Shared centered card used by manager/tenant auth screens.
export default function AuthShell({ accent = 'gold', eyebrow, title, subtitle, children, footer }) {
  return (
    <div className={accent === 'green' ? 'theme-tenant' : ''}
      style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <Link to="/" className="row gap" style={{ color: 'var(--text-faint)', fontSize: '0.84rem', marginBottom: 20 }}>
          <IconArrowRight size={14} style={{ transform: 'rotate(180deg)' }} /> Back to role selection
        </Link>

        <div className="card pad">
          <div className="eyebrow">{eyebrow}</div>
          <h1 style={{ fontSize: '2rem', marginTop: 4 }}>{title}</h1>
          {subtitle && <p className="muted" style={{ marginTop: 4, marginBottom: 22 }}>{subtitle}</p>}
          {children}
        </div>

        {footer && <div style={{ textAlign: 'center', marginTop: 16, fontSize: '0.88rem' }} className="muted">{footer}</div>}
      </div>
    </div>
  )
}
