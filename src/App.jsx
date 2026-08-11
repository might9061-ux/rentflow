import { Suspense, useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import { LoadingScreen } from './components/ui.jsx'
import AppLock from './components/AppLock.jsx'
import MfaChallenge from './components/MfaChallenge.jsx'
import { needsChallenge } from './lib/mfa.js'
import { resetDemo } from './lib/db.js'
import { safeLazy } from './lib/appUpdate.js'

// Landing stays eager for the fastest first paint; everything else is split into
// its own chunk that only downloads when that route is visited.
// safeLazy wraps React.lazy to detect when a chunk resolves to undefined (stale
// build after a deploy) and throws a recognisable ChunkLoadError so the
// ErrorBoundary can auto-reload instead of crashing.
import RolePicker from './pages/RolePicker.jsx'
const ManagerAuth = safeLazy(() => import('./pages/manager/ManagerAuth.jsx'))
const TenantLogin = safeLazy(() => import('./pages/tenant/TenantLogin.jsx'))
const ResetPassword = safeLazy(() => import('./pages/ResetPassword.jsx'))
const Privacy = safeLazy(() => import('./pages/Privacy.jsx'))
const Terms = safeLazy(() => import('./pages/Terms.jsx'))
const PublicListings = safeLazy(() => import('./pages/public/Listings.jsx'))
const PublicListing = safeLazy(() => import('./pages/public/Listing.jsx'))

const ManagerLayout = safeLazy(() => import('./pages/manager/ManagerLayout.jsx'))
const ManagerDashboard = safeLazy(() => import('./pages/manager/Dashboard.jsx'))
const Properties = safeLazy(() => import('./pages/manager/Properties.jsx'))
const PropertyDetail = safeLazy(() => import('./pages/manager/PropertyDetail.jsx'))
const Tenants = safeLazy(() => import('./pages/manager/Tenants.jsx'))
const TenantDetail = safeLazy(() => import('./pages/manager/TenantDetail.jsx'))
const Approvals = safeLazy(() => import('./pages/manager/Approvals.jsx'))
const Payments = safeLazy(() => import('./pages/manager/Payments.jsx'))
const ManagerNotifications = safeLazy(() => import('./pages/manager/Notifications.jsx'))
const ManagerMessages = safeLazy(() => import('./pages/manager/Messages.jsx'))
const Reminders = safeLazy(() => import('./pages/manager/Reminders.jsx'))
const Maintenance = safeLazy(() => import('./pages/manager/Maintenance.jsx'))
const Finances = safeLazy(() => import('./pages/manager/Finances.jsx'))
const Payroll = safeLazy(() => import('./pages/manager/Payroll.jsx'))
const Workers = safeLazy(() => import('./pages/manager/Workers.jsx'))
const Settings = safeLazy(() => import('./pages/manager/Settings.jsx'))
const Plan = safeLazy(() => import('./pages/manager/Plan.jsx'))
const Demo = safeLazy(() => import('./pages/manager/Demo.jsx'))
const Branding = safeLazy(() => import('./pages/manager/Branding.jsx'))
const Team = safeLazy(() => import('./pages/manager/Team.jsx'))

const TenantLayout = safeLazy(() => import('./pages/tenant/TenantLayout.jsx'))
const TenantDashboard = safeLazy(() => import('./pages/tenant/Dashboard.jsx'))
const SubmitPayment = safeLazy(() => import('./pages/tenant/SubmitPayment.jsx'))
const PaymentHistory = safeLazy(() => import('./pages/tenant/PaymentHistory.jsx'))
const TenantLease = safeLazy(() => import('./pages/tenant/Lease.jsx'))
const TenantNotifications = safeLazy(() => import('./pages/tenant/Notifications.jsx'))
const TenantMessages = safeLazy(() => import('./pages/tenant/Messages.jsx'))
const TenantMaintenance = safeLazy(() => import('./pages/tenant/Maintenance.jsx'))
const AdminAuth = safeLazy(() => import('./pages/admin/AdminAuth.jsx'))
const AdminLayout = safeLazy(() => import('./pages/admin/AdminLayout.jsx'))
const AdminOverview = safeLazy(() => import('./pages/admin/AdminOverview.jsx'))
const AdminWorkspaces = safeLazy(() => import('./pages/admin/AdminWorkspaces.jsx'))
const AdminSubscriptions = safeLazy(() => import('./pages/admin/AdminSubscriptions.jsx'))
const AdminFees = lazy(() => import('./pages/admin/AdminFees.jsx'))
const AdminCosts = lazy(() => import('./pages/admin/AdminCosts.jsx'))
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers.jsx'))
const AdminAudit = lazy(() => import('./pages/admin/AdminAudit.jsx'))
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings.jsx'))

function RequireRole({ role, children }) {
  const { loading, session } = useAuth()
  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to={role === 'manager' ? '/manager/auth' : '/tenant/login'} replace />
  if (session.role !== role) return <Navigate to="/" replace />
  return children
}

// The platform owner (RentLoja HQ) — sees subscriptions & revenue, not a workspace.
//
// When two-factor is enrolled, a password-only session (AAL1) is not enough:
// Supabase still issues a session, so we check the assurance level and demand
// the code. The API enforces the same rule, so skipping this in the browser
// gains nothing.
function RequireAdmin({ children }) {
  const { loading, session, profile } = useAuth()
  const [mfaState, setMfaState] = useState('checking') // checking | ok | needed

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!session) return
      try {
        const need = await needsChallenge()
        if (alive) setMfaState(need ? 'needed' : 'ok')
      } catch { if (alive) setMfaState('ok') } // never lock the owner out on a lookup failure
    })()
    return () => { alive = false }
  }, [session])

  if (loading) return <LoadingScreen />
  if (!session || session.role !== 'manager') return <Navigate to="/admin/login" replace />
  if (!profile) return <LoadingScreen />
  if (!profile.platform_admin) return <Navigate to="/manager" replace />
  if (mfaState === 'checking') return <LoadingScreen />
  if (mfaState === 'needed') return <MfaChallenge onVerified={() => setMfaState('ok')} />
  return children
}

// A small persistent marker while a visitor is exploring the opt-in demo, with a
// one-tap way out (clears the demo flag + mock session and returns to the real app).
function DemoRibbon() {
  let on = false, role = null
  try {
    on = localStorage.getItem('rentflow_demo') === '1'
    const s = JSON.parse(localStorage.getItem('rentflow_session_v1') || 'null')
    role = s?.role || null
  } catch {}
  if (!on) return null
  const other = role === 'tenant' ? 'manager' : 'tenant'
  // Switch sides: sign into the other demo account on the next load (keeps data).
  const switchTo = (r) => {
    try { localStorage.setItem('rentflow_demo_start', r); localStorage.removeItem('rentflow_session_v1') } catch {}
    window.location.assign('/')
  }
  // Leaving the demo wipes any changes back to the seeded defaults.
  const leave = (to) => {
    try { resetDemo(); localStorage.removeItem('rentflow_demo'); localStorage.removeItem('rentflow_demo_start') } catch {}
    window.location.assign(to)
  }
  return (
    <div style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 400, display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 8px 7px 14px', borderRadius: 999, background: 'var(--gold-bg)', border: '1px solid var(--gold-line)',
      color: 'var(--text)', fontSize: '0.8rem', boxShadow: 'var(--shadow)', flexWrap: 'wrap', maxWidth: 'calc(100vw - 24px)' }}>
      <span style={{ fontWeight: 700, color: 'var(--gold)' }}>Demo</span>
      {role && <span className="muted" style={{ fontSize: '0.74rem' }}>{role} view</span>}
      <button className="btn primary sm" onClick={() => leave('/manager/auth')}>Start free trial</button>
      <button className="btn ghost sm" onClick={() => switchTo(other)}>View {other} side</button>
      <button className="btn ghost sm" onClick={() => leave('/')}>Exit</button>
    </div>
  )
}

export default function App() {
  const { loading, session, profile } = useAuth()
  if (loading) return <LoadingScreen />

  const home = !session ? null
    : session.role !== 'manager' ? '/tenant'
    : profile?.platform_admin ? '/admin' : '/manager'

  return (
    <>
    {/* Covers the whole app when it's been backgrounded — session stays live. */}
    <AppLock />
    <DemoRibbon />
    <Suspense fallback={<LoadingScreen />}>
    <Routes>
      {/* Landing role picker */}
      <Route path="/" element={home ? <Navigate to={home} replace /> : <RolePicker />} />

      {/* Platform admin — hidden App-owner login + console */}
      <Route path="/admin/login" element={<AdminAuth />} />
      <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
        <Route index element={<AdminOverview />} />
        <Route path="workspaces" element={<AdminWorkspaces />} />
        <Route path="subscriptions" element={<AdminSubscriptions />} />
        <Route path="fees" element={<AdminFees />} />
        <Route path="costs" element={<AdminCosts />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="audit" element={<AdminAudit />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      {/* Auth */}
      <Route path="/manager/auth" element={session ? <Navigate to="/manager" replace /> : <ManagerAuth />} />
      <Route path="/tenant/login" element={session ? <Navigate to="/tenant" replace /> : <TenantLogin />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/demo" element={<Demo />} />
      {/* Public property marketplace — no login. */}
      <Route path="/rent" element={<PublicListings />} />
      <Route path="/rent/:id" element={<PublicListing />} />

      {/* Manager app */}
      <Route path="/manager" element={<RequireRole role="manager"><ManagerLayout /></RequireRole>}>
        <Route index element={<ManagerDashboard />} />
        <Route path="properties" element={<Properties />} />
        <Route path="properties/:id" element={<PropertyDetail />} />
        <Route path="tenants" element={<Tenants />} />
        <Route path="tenants/:id" element={<TenantDetail />} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="payments" element={<Payments />} />
        <Route path="arrears" element={<Navigate to="/manager/payments" replace />} />
        <Route path="advance" element={<Navigate to="/manager/payments" replace />} />
        <Route path="notifications" element={<ManagerNotifications />} />
        <Route path="messages" element={<ManagerMessages />} />
        <Route path="reminders" element={<Reminders />} />
        <Route path="maintenance" element={<Maintenance />} />
        <Route path="finances" element={<Finances />} />
        <Route path="payroll" element={<Payroll />} />
        <Route path="workers" element={<Workers />} />
        <Route path="settings" element={<Settings />} />
        <Route path="plan" element={<Plan />} />
        <Route path="branding" element={<Branding />} />
        <Route path="team" element={<Team />} />
      </Route>

      {/* Tenant app */}
      <Route path="/tenant" element={<RequireRole role="tenant"><TenantLayout /></RequireRole>}>
        <Route index element={<TenantDashboard />} />
        <Route path="pay" element={<SubmitPayment />} />
        <Route path="history" element={<PaymentHistory />} />
        <Route path="lease" element={<TenantLease />} />
        <Route path="maintenance" element={<TenantMaintenance />} />
        <Route path="notifications" element={<TenantNotifications />} />
        <Route path="messages" element={<TenantMessages />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    </>
  )
}
