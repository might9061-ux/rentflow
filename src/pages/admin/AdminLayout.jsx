import { useEffect, useState, useCallback } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { db } from '../../lib/db.js'
import { PERIODS } from '../../lib/period.js'
import { IconChart, IconBuilding, IconTag, IconWallet, IconUsers, IconLogout, IconArrowRight } from '../../components/icons.jsx'

const TABS = [
  { to: '/admin', end: true, label: 'Overview', icon: IconChart },
  { to: '/admin/workspaces', label: 'Workspaces', icon: IconBuilding },
  { to: '/admin/subscriptions', label: 'Subscriptions', icon: IconTag },
  { to: '/admin/fees', label: 'Transaction fees', icon: IconWallet },
  { to: '/admin/users', label: 'Users', icon: IconUsers },
]

export default function AdminLayout() {
  const { profile, signOut } = useAuth()
  const nav = useNavigate()
  const [overview, setOverview] = useState(null)
  const [period, setPeriod] = useState('this_month')

  const reload = useCallback(async () => { setOverview(await db.adminOverview()) }, [])
  useEffect(() => { reload() }, [reload])

  return (
    <div className="admin-shell">
      <header className="admin-top">
        <div className="row gap">
          <div className="mark" style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--gold-bg)', border: '1px solid var(--gold-line)', color: 'var(--gold)', fontFamily: 'var(--serif)', fontWeight: 700 }}>RL</div>
          <div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '1.25rem', fontWeight: 600, lineHeight: 1 }}>RentLoja</div>
            <div className="eyebrow" style={{ color: 'var(--gold)' }}>Platform admin</div>
          </div>
        </div>
        <div className="row gap">
          <span className="muted desktop-only" style={{ fontSize: '0.84rem' }}>{profile?.email}</span>
          <button className="btn ghost sm" onClick={signOut}><IconLogout size={15} /> Sign out</button>
        </div>
      </header>

      <nav className="admin-nav">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <NavLink key={t.to} to={t.to} end={t.end} className="admin-tab">
              <Icon size={15} /> <span>{t.label}</span>
            </NavLink>
          )
        })}
      </nav>

      <main className="page" style={{ maxWidth: 1080, margin: '0 auto' }}>
        {/* Navigate back + choose the time-frame for the figures below. */}
        <div className="spread wrap no-print" style={{ gap: 10, marginBottom: 14 }}>
          <button className="btn ghost sm" onClick={() => nav(-1)}>
            <IconArrowRight size={14} style={{ transform: 'rotate(180deg)' }} /> Back
          </button>
          <div className="seg">
            {PERIODS.map((p) => (
              <button key={p.id} className={period === p.id ? 'on' : ''} onClick={() => setPeriod(p.id)}>{p.label}</button>
            ))}
          </div>
        </div>
        <Outlet context={{ overview, period, setPeriod }} />
      </main>

      <style>{`
        .admin-shell { min-height: 100vh; background: var(--bg); }
        .admin-top { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; justify-content: space-between;
          padding: 12px 22px; border-bottom: 1px solid var(--line-soft); background: var(--topbar-bg, rgba(10,9,8,0.82)); backdrop-filter: blur(10px); }
        .admin-nav { position: sticky; top: 63px; z-index: 19; display: flex; gap: 4px; padding: 8px 22px; overflow-x: auto;
          border-bottom: 1px solid var(--line-soft); background: var(--bg); }
        .admin-tab { display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px; border-radius: 99px; white-space: nowrap;
          color: var(--text-dim); font-size: 0.86rem; font-weight: 500; border: 1px solid transparent; }
        .admin-tab:hover { color: var(--text); background: var(--surface-2); }
        .admin-tab.active { color: var(--gold); background: var(--gold-bg); border-color: var(--gold-line); }
        .desktop-only { display: inline; }
        @media (max-width: 640px) { .desktop-only { display: none; } }
      `}</style>
    </div>
  )
}
