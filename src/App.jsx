import { lazy, Suspense, useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import { LoadingScreen } from './components/ui.jsx'
import AppLock from './components/AppLock.jsx'
import MfaChallenge from './components/MfaChallenge.jsx'
import { needsChallenge } from './lib/mfa.js'

// Landing stays eager for the fastest first paint; everything else is split into
// its own chunk that only downloads when that route is visited.
import RolePicker from './pages/RolePicker.jsx'
const ManagerAuth = lazy(() => import('./pages/manager/ManagerAuth.jsx'))
const TenantLogin = lazy(() => import('./pages/tenant/TenantLogin.jsx'))
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'))
const Privacy = lazy(() => import('./pages/Privacy.jsx'))
const PublicListings = lazy(() => import('./pages/public/Listings.jsx'))
const PublicListing = lazy(() => import('./pages/public/Listing.jsx'))

const ManagerLayout = lazy(() => import('./pages/manager/ManagerLayout.jsx'))
const ManagerDashboard = lazy(() => import('./pages/manager/Dashboard.jsx'))
const Properties = lazy(() => import('./pages/manager/Properties.jsx'))
const PropertyDetail = lazy(() => import('./pages/manager/PropertyDetail.jsx'))
const Tenants = lazy(() => import('./pages/manager/Tenants.jsx'))
const TenantDetail = lazy(() => import('./pages/manager/TenantDetail.jsx'))
const Approvals = lazy(() => import('./pages/manager/Approvals.jsx'))
const Payments = lazy(() => import('./pages/manager/Payments.jsx'))
const ManagerNotifications = lazy(() => import('./pages/manager/Notifications.jsx'))
const ManagerMessages = lazy(() => import('./pages/manager/Messages.jsx'))
const Reminders = lazy(() => import('./pages/manager/Reminders.jsx'))
const Maintenance = lazy(() => import('./pages/manager/Maintenance.jsx'))
const Finances = lazy(() => import('./pages/manager/Finances.jsx'))
const Payroll = lazy(() => import('./pages/manager/Payroll.jsx'))
const Workers = lazy(() => import('./pages/manager/Workers.jsx'))
const Settings = lazy(() => import('./pages/manager/Settings.jsx'))
const Plan = lazy(() => import('./pages/manager/Plan.jsx'))
const Demo = lazy(() => import('./pages/manager/Demo.jsx'))
const Branding = lazy(() => import('./pages/manager/Branding.jsx'))
const Team = lazy(() => import('./pages/manager/Team.jsx'))

const TenantLayout = lazy(() => import('./pages/tenant/TenantLayout.jsx'))
const TenantDashboard = lazy(() => import('./pages/tenant/Dashboard.jsx'))
const SubmitPayment = lazy(() => import('./pages/tenant/SubmitPayment.jsx'))
const PaymentHistory = lazy(() => import('./pages/tenant/PaymentHistory.jsx'))
const TenantNotifications = lazy(() => import('./pages/tenant/Notifications.jsx'))
const TenantMessages = lazy(() => import('./pages/tenant/Messages.jsx'))
const TenantMaintenance = lazy(() => import('./pages/tenant/Maintenance.jsx'))
const AdminAuth = lazy(() => import('./pages/admin/AdminAuth.jsx'))
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout.jsx'))
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview.jsx'))
const AdminWorkspaces = lazy(() => import('./pages/admin/AdminWorkspaces.jsx'))
const AdminSubscriptions = lazy(() => import('./pages/admin/AdminSubscriptions.jsx'))
const AdminFees = lazy(() => import('./pages/admin/AdminFees.jsx'))
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
        <Route path="users" element={<AdminUsers />} />
        <Route path="audit" element={<AdminAudit />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      {/* Auth */}
      <Route path="/manager/auth" element={session ? <Navigate to="/manager" replace /> : <ManagerAuth />} />
      <Route path="/tenant/login" element={session ? <Navigate to="/tenant" replace /> : <TenantLogin />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/privacy" element={<Privacy />} />
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
        <Route path="demo" element={<Demo />} />
      </Route>

      {/* Tenant app */}
      <Route path="/tenant" element={<RequireRole role="tenant"><TenantLayout /></RequireRole>}>
        <Route index element={<TenantDashboard />} />
        <Route path="pay" element={<SubmitPayment />} />
        <Route path="history" element={<PaymentHistory />} />
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
