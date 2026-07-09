import { useState, useEffect, useCallback, useRef } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { db } from '../../lib/db.js'
import { initials, timeAgo } from '../../lib/format.js'
import { CountBadge, Spinner } from '../../components/ui.jsx'
import ChangePasswordModal from '../../components/ChangePasswordModal.jsx'
import AssistantWidget from '../../components/AssistantWidget.jsx'
import QuickUnlockSetup from '../../components/QuickUnlockSetup.jsx'
import ProfileModal from '../../components/ProfileModal.jsx'
import { hasQuickUnlock } from '../../lib/quickUnlock.js'
import { brandVars } from '../../lib/brand.js'
import { setActiveCurrency } from '../../lib/format.js'
import { currencyByCode, marketFor } from '../../lib/markets.js'
import TenantVerify from './TenantVerify.jsx'
import {
  IconHome, IconWallet, IconReceipt, IconBell, IconLogout, IconMenu, IconUsers, IconWarn, IconInfo, IconKey, IconArrowRight, IconWrench,
} from '../../components/icons.jsx'

const NAV = [
  { to: '/tenant', end: true, label: 'Dashboard', icon: IconHome },
  { to: '/tenant/pay', label: 'Submit payment', icon: IconWallet },
  { to: '/tenant/history', label: 'Payment history', icon: IconReceipt },
  { to: '/tenant/maintenance', label: 'Maintenance', icon: IconWrench },
  { to: '/tenant/notifications', label: 'Notifications', icon: IconBell },
]

export default function TenantLayout() {
  const { profile, userId, signOut, loading } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [showChangePw, setShowChangePw] = useState(false)
  const [showQuickUnlock, setShowQuickUnlock] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [brandMgr, setBrandMgr] = useState(null)
  const loc = useLocation()

  const firstNav = useRef(true)
  useEffect(() => {
    setOpen(false)
    if (firstNav.current) { firstNav.current = false; return }
    setShowQuickUnlock(false)
  }, [loc.pathname])
  useEffect(() => { (async () => {
    if (!userId) return
    const m = await db.getTenantManager(userId)
    if (m) setActiveCurrency(currencyByCode(m.currency || marketFor(m.country).currency))
    setBrandMgr(m)
  })() }, [userId])
  // Offer quick-unlock setup once per login session (only after first-login verification).
  useEffect(() => {
    if (!userId || !profile || profile.first_login) return
    const flag = `rentflow_ql_prompted_${userId}`
    if (!hasQuickUnlock(userId) && !sessionStorage.getItem(flag)) {
      sessionStorage.setItem(flag, '1'); setShowQuickUnlock(true)
    }
  }, [userId, profile])

  if (loading || !profile) return <div className="loading-screen"><Spinner /></div>

  // Force first-login verification before any dashboard access.
  if (profile.first_login) return <TenantVerify />

  const brandName = brandMgr?.brand_name || 'RentFlow'
  const brandMark = brandMgr?.brand_name ? brandMgr.brand_name.slice(0, 2).toUpperCase() : 'RF'
  const brandStyle = brandVars(brandMgr?.brand_color)

  return (
    <div className="shell theme-tenant" style={brandStyle}>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          {brandMgr?.brand_logo
            ? <img className="mark-img" src={brandMgr.brand_logo} alt="logo" />
            : <div className="mark">{brandMark}</div>}
          <div>
            <div className="b-name">{brandName}</div>
            <div className="b-role">Tenant</div>
          </div>
        </div>

        {NAV.map((n) => {
          const Icon = n.icon
          return (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
              <Icon className="ico" /><span>{n.label}</span>
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
              <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text)' }}>{profile?.first_name} {profile?.last_name}</div>
              <div className="muted" style={{ fontSize: '0.72rem' }}>View profile</div>
            </div>
          </button>
          <button className="btn ghost block sm" onClick={() => setShowChangePw(true)} style={{ marginBottom: 8 }}>
            <IconKey size={15} /> Change password
          </button>
          <button className="btn ghost block sm" onClick={signOut}><IconLogout size={15} /> Sign out</button>
        </div>
      </aside>

      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
      {showProfile && <ProfileModal role="tenant" onClose={() => setShowProfile(false)} onChangePassword={() => setShowChangePw(true)} />}
      {showQuickUnlock && profile && (
        <QuickUnlockSetup
          meta={{ userId, role: 'tenant', name: `${profile.first_name} ${profile.last_name}`, identifier: profile.email }}
          onClose={() => setShowQuickUnlock(false)} />
      )}

      {brandMgr?.ai_enabled_tenants !== false && <AssistantWidget role="tenant" />}

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
              {brandMgr?.brand_logo
                ? <img className="tb-logo" src={brandMgr.brand_logo} alt="logo" />
                : <span className="tb-mark">{brandMark}</span>}
              <span className="tb-name">{brandName}</span>
            </div>
          </div>
          <div className="row gap desktop-only" style={{ color: 'var(--accent)' }}>
            <IconUsers size={15} />
            <span className="eyebrow" style={{ color: 'var(--accent)' }}>Tenant portal</span>
          </div>
          <NotifBell tenantId={userId} />
        </div>
        <Outlet />
      </div>

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

const PRIO_ICON = { urgent: IconWarn, info: IconInfo, normal: IconBell }

function NotifBell({ tenantId }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const ref = useRef(null)

  const load = useCallback(async () => {
    const list = await db.listTenantNotifications(tenantId)
    setItems(list); setUnread(list.filter((n) => !n.read).length)
  }, [tenantId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next) {
      const unreadItems = items.filter((n) => !n.read)
      await Promise.all(unreadItems.map((n) => db.markNotificationRead(n.id, tenantId)))
      if (unreadItems.length) setTimeout(load, 400)
    }
  }

  return (
    <div className="bell" ref={ref}>
      <button className="btn ghost" onClick={toggle} aria-label="Notifications">
        <IconBell size={18} />
        {unread > 0 && <CountBadge n={unread} />}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="spread" style={{ padding: '14px 16px', borderBottom: '1px solid var(--line-soft)' }}>
            <b>Notifications</b>
            <span className="muted" style={{ fontSize: '0.78rem' }}>{items.length}</span>
          </div>
          {items.length === 0 ? (
            <div className="empty-state" style={{ padding: 32 }}><div className="es-ico">🔔</div><span className="muted">No notifications</span></div>
          ) : items.map((n) => {
            const Icon = PRIO_ICON[n.priority] || IconBell
            return (
              <div key={n.id} className={`notif-item ${!n.read ? 'unread' : ''}`}>
                <div className="spread">
                  <div className="row gap" style={{ color: n.priority === 'urgent' ? 'var(--danger)' : 'var(--green)' }}>
                    <Icon size={14} /><b style={{ fontSize: '0.9rem', color: 'var(--text)' }}>{n.subject}</b>
                  </div>
                  <span className="muted" style={{ fontSize: '0.72rem' }}>{timeAgo(n.created_at)}</span>
                </div>
                <p className="muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>{n.message}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
