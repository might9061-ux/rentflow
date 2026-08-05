import { useEffect, useState, useCallback } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { db } from '../../lib/db.js'
import { PERIODS } from '../../lib/period.js'
import {
  IconChart, IconBuilding, IconTag, IconWallet, IconUsers, IconLogout,
  IconArrowRight, IconShield, IconSettings, IconMenu,
} from '../../components/icons.jsx'
import Logo from '../../components/Logo.jsx'

// `period: true` marks the pages whose figures are filtered by the time-frame.
// The picker is hidden everywhere else — on Users, Activity and Settings it
// changed nothing, so it was just a control that appeared to do nothing.
const NAV = [
  { to: '/admin', end: true, label: 'Overview', icon: IconChart, period: true },
  { to: '/admin/workspaces', label: 'Workspaces', icon: IconBuilding, period: true },
  { to: '/admin/subscriptions', label: 'Subscriptions', icon: IconTag, period: true },
  { to: '/admin/fees', label: 'Transaction fees', icon: IconWallet, period: true },
  { to: '/admin/users', label: 'Users', icon: IconUsers },
  { to: '/admin/audit', label: 'Activity', icon: IconShield },
  { to: '/admin/settings', label: 'Settings', icon: IconSettings },
]

// Uses the same sidebar shell as the manager app: the old top tab-bar pushed
// items off-screen on a phone and needed horizontal scrolling to reach them.
export default function AdminLayout() {
  const { profile, signOut } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [overview, setOverview] = useState(null)
  const [period, setPeriod] = useState('this_month')
  const [open, setOpen] = useState(false)

  const reload = useCallback(async () => { setOverview(await db.adminOverview()) }, [])
  useEffect(() => { reload() }, [reload])
  // Close the drawer whenever navigation happens (phones).
  useEffect(() => { setOpen(false) }, [loc.pathname])

  // Only show the time-frame picker where it actually filters something.
  const path = loc.pathname.replace(/\/+$/, '') || '/admin'
  const showPeriod = NAV.some((n) => n.period && (n.end ? path === n.to : path.startsWith(n.to)))

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="mark"><Logo size={22} /></div>
          <div>
            <div className="b-name">RentLoja</div>
            <div className="b-role">App owner</div>
          </div>
        </div>

        {NAV.map((n) => {
          const Icon = n.icon
          return (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
              <Icon className="ico" />
              <span>{n.label}</span>
            </NavLink>
          )
        })}

        <div className="sidebar-foot">
          <div className="muted" style={{ fontSize: '0.74rem', marginBottom: 8, wordBreak: 'break-all' }}>
            {profile?.email}
          </div>
          <button className="btn ghost block sm" onClick={signOut}><IconLogout size={15} /> Sign out</button>
        </div>
      </aside>

      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}

      <div className="content">
        <div className="topbar">
          <div className="row gap">
            <button className="btn ghost sm mobile-only" onClick={() => setOpen((o) => !o)} aria-label="Menu">
              <IconMenu size={18} />
            </button>
            {loc.key !== 'default' && (
              <button className="btn ghost sm" onClick={() => nav(-1)} title="Go back">
                <IconArrowRight size={15} style={{ transform: 'rotate(180deg)' }} /> <span className="back-label">Back</span>
              </button>
            )}
            <div className="topbar-brand mobile-only">
              <span className="tb-mark"><Logo size={15} /></span>
              <span className="tb-name">RentLoja</span>
            </div>
          </div>
          {/* Time-frame — only on pages whose figures it actually filters. */}
          {showPeriod && (
            <div className="seg no-print">
              {PERIODS.map((p) => (
                <button key={p.id} className={period === p.id ? 'on' : ''} onClick={() => setPeriod(p.id)}>{p.label}</button>
              ))}
            </div>
          )}
        </div>

        <main className="page" style={{ maxWidth: 1080, margin: '0 auto' }}>
          <Outlet context={{ overview, period, setPeriod, reload }} />
        </main>
      </div>
    </div>
  )
}
