import { useState, useEffect, useCallback, useRef } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useTheme } from '../../context/ThemeContext.jsx'
import { db } from '../../lib/db.js'
import { initials } from '../../lib/format.js'
import { CountBadge } from '../../components/ui.jsx'
import ChangePasswordModal from '../../components/ChangePasswordModal.jsx'
import AssistantWidget from '../../components/AssistantWidget.jsx'
import QuickUnlockSetup from '../../components/QuickUnlockSetup.jsx'
import ProfileModal from '../../components/ProfileModal.jsx'
import { hasQuickUnlock } from '../../lib/quickUnlock.js'
import {
  IconGrid, IconBuilding, IconUsers, IconCheckCircle, IconWallet,
  IconBell, IconLogout, IconMenu, IconKey, IconSettings, IconTag, IconSparkle, IconPalette, IconSun, IconMoon, IconClock, IconShield, IconArrowRight, IconWrench, IconChart, IconCash,
} from '../../components/icons.jsx'
import { brandVars } from '../../lib/brand.js'

const NAV = [
  { to: '/manager', end: true, label: 'Dashboard', icon: IconGrid },
  { to: '/manager/properties', label: 'Properties', icon: IconBuilding },
  { to: '/manager/tenants', label: 'Tenants', icon: IconUsers },
  { to: '/manager/approvals', label: 'Approvals', icon: IconCheckCircle, badge: 'pending' },
  { to: '/manager/payments', label: 'Payments', icon: IconWallet },
  { to: '/manager/reminders', label: 'Reminders', icon: IconClock, badge: 'reminders' },
  { to: '/manager/maintenance', label: 'Maintenance', icon: IconWrench, badge: 'maintenance' },
  { to: '/manager/finances', label: 'Finances', icon: IconChart },
  { to: '/manager/payroll', label: 'Payroll', icon: IconCash, perm: 'payroll' },
  { to: '/manager/notifications', label: 'Notifications', icon: IconBell },
  { to: '/manager/team', label: 'Agents', icon: IconShield, owner: true },
  { to: '/manager/plan', label: 'Plan', icon: IconTag, owner: true },
  { to: '/manager/branding', label: 'Branding', icon: IconPalette, owner: true },
  { to: '/manager/demo', label: 'Demo', icon: IconSparkle, owner: true },
  { to: '/manager/settings', label: 'Settings', icon: IconSettings, owner: true },
]

// Pages only the account owner may open (staff are redirected away).
const OWNER_ONLY = ['/manager/team', '/manager/plan', '/manager/branding', '/manager/demo', '/manager/settings']

export default function ManagerLayout() {
  const { profile, userId, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(0)
  const [dueReminders, setDueReminders] = useState(0)
  const [openRepairs, setOpenRepairs] = useState(0)
  const [showChangePw, setShowChangePw] = useState(false)
  const [showQuickUnlock, setShowQuickUnlock] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const loc = useLocation()

  const loadPending = useCallback(async () => {
    if (!userId) return
    const [rows, due, repairs] = await Promise.all([
      db.listPayments(userId, { status: 'pending' }),
      db.dueRemindersCount(userId),
      db.maintenanceOpenCount(userId),
    ])
    setPending(rows.length); setDueReminders(due); setOpenRepairs(repairs)
  }, [userId])

  useEffect(() => { loadPending() }, [loadPending, loc.pathname])
  // Close the menu and any lingering quick-unlock prompt when navigating, so it
  // never sits on top of the page or stacks with another modal.
  const firstNav = useRef(true)
  useEffect(() => {
    setOpen(false)
    if (firstNav.current) { firstNav.current = false; return }
    setShowQuickUnlock(false)
  }, [loc.pathname])
  // Offer quick-unlock setup once per login session on this device.
  useEffect(() => {
    if (!userId || !profile) return
    const flag = `rentflow_ql_prompted_${userId}`
    if (!hasQuickUnlock(userId) && !sessionStorage.getItem(flag)) {
      sessionStorage.setItem(flag, '1'); setShowQuickUnlock(true)
    }
  }, [userId, profile])

  // The platform owner doesn't have a property workspace — send them to /admin.
  if (profile?.platform_admin) return <Navigate to="/admin" replace />

  const isOwner = profile?.role !== 'staff'

  // New OWNERS must pick an installment plan before using the rest of the app
  // (the plan page and the demo/tour are allowed while onboarding). Staff skip this.
  if (isOwner && profile && profile.onboarded === false && loc.pathname !== '/manager/plan' && loc.pathname !== '/manager/demo') {
    return <Navigate to="/manager/plan" replace />
  }
  // Staff cannot reach owner-only pages.
  if (!isOwner && OWNER_ONLY.some((p) => loc.pathname.startsWith(p))) {
    return <Navigate to="/manager" replace />
  }
  // Payroll is owner OR a staff member the owner granted payroll access.
  const canPayroll = isOwner || !!profile?.can_payroll
  if (!canPayroll && loc.pathname.startsWith('/manager/payroll')) {
    return <Navigate to="/manager" replace />
  }

  const brandName = profile?.brand_name || 'RentLoja'
  const brandMark = profile?.brand_name ? profile.brand_name.slice(0, 2).toUpperCase() : 'RL'
  const brandStyle = brandVars(profile?.brand_color)

  return (
    <div className="shell" style={brandStyle}>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          {profile?.brand_logo
            ? <img className="mark-img" src={profile.brand_logo} alt="logo" />
            : <div className="mark">{brandMark}</div>}
          <div>
            <div className="b-name">{brandName}</div>
            <div className="b-role">{isOwner ? 'Manager' : 'Agent'}</div>
          </div>
        </div>

        {NAV.filter((n) => {
          if (n.perm === 'payroll') return canPayroll
          return !n.owner || isOwner
        }).map((n) => {
          const Icon = n.icon
          return (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
              <Icon className="ico" />
              <span>{n.label}</span>
              {n.badge === 'pending' && pending > 0 && <span className="nav-badge"><CountBadge n={pending} /></span>}
              {n.badge === 'reminders' && dueReminders > 0 && <span className="nav-badge"><CountBadge n={dueReminders} /></span>}
              {n.badge === 'maintenance' && openRepairs > 0 && <span className="nav-badge"><CountBadge n={openRepairs} /></span>}
            </NavLink>
          )
        })}

        <div className="sidebar-foot">
          <button className="user-chip" onClick={() => setShowProfile(true)} title="My profile"
            style={{ padding: '8px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
            {profile?.avatar
              ? <img src={profile.avatar} alt="" className="avatar" style={{ objectFit: 'cover' }} />
              : <div className="avatar">{initials(profile?.first_name, profile?.last_name)}</div>}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile?.first_name} {profile?.last_name}
              </div>
              <div className="muted" style={{ fontSize: '0.72rem' }}>View profile</div>
            </div>
          </button>
          <button className="btn ghost block sm" onClick={toggle} style={{ marginBottom: 8 }}>
            {theme === 'dark' ? <IconSun size={15} /> : <IconMoon size={15} />} {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button className="btn ghost block sm" onClick={() => setShowChangePw(true)} style={{ marginBottom: 8 }}>
            <IconKey size={15} /> Change password
          </button>
          <button className="btn ghost block sm" onClick={signOut}><IconLogout size={15} /> Sign out</button>
        </div>
      </aside>

      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
      {showProfile && <ProfileModal role="manager" onClose={() => setShowProfile(false)} onChangePassword={() => setShowChangePw(true)} />}
      {showQuickUnlock && profile && (
        <QuickUnlockSetup
          meta={{ userId, role: 'manager', name: `${profile.first_name} ${profile.last_name}`, identifier: profile.email }}
          onClose={() => setShowQuickUnlock(false)} />
      )}

      <div className="content">
        <div className="topbar">
          <div className="row gap">
            <button className="btn ghost sm mobile-only" onClick={() => setOpen((o) => !o)}><IconMenu size={18} /></button>
            {loc.key !== 'default' && (
              <button className="btn ghost sm" onClick={() => nav(-1)} title="Go back">
                <IconArrowRight size={15} style={{ transform: 'rotate(180deg)' }} /> <span className="back-label">Back</span>
              </button>
            )}
            <div className="topbar-brand mobile-only">
              {profile?.brand_logo
                ? <img className="tb-logo" src={profile.brand_logo} alt="logo" />
                : <span className="tb-mark">{brandMark}</span>}
              <span className="tb-name">{brandName}</span>
            </div>
          </div>
          <div className="row gap desktop-only" style={{ color: 'var(--accent)' }}>
            <IconKey size={15} />
            <span className="eyebrow" style={{ color: 'var(--accent)' }}>Manager workspace</span>
          </div>
          <div />
        </div>
        <Outlet context={{ reloadPending: loadPending }} />
      </div>

      {profile?.ai_enabled_self !== false && <AssistantWidget role="manager" />}

      <style>{`
        .mobile-only { display: none; }
        .desktop-only { display: flex; }
        @media (max-width: 860px) {
          .mobile-only { display: inline-flex; }
          .desktop-only { display: none; }
        }
      `}</style>
    </div>
  )
}
