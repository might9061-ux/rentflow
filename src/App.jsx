import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import { LoadingScreen } from './components/ui.jsx'

import RolePicker from './pages/RolePicker.jsx'
import ManagerAuth from './pages/manager/ManagerAuth.jsx'
import TenantLogin from './pages/tenant/TenantLogin.jsx'
import ResetPassword from './pages/ResetPassword.jsx'

import ManagerLayout from './pages/manager/ManagerLayout.jsx'
import ManagerDashboard from './pages/manager/Dashboard.jsx'
import Properties from './pages/manager/Properties.jsx'
import PropertyDetail from './pages/manager/PropertyDetail.jsx'
import Tenants from './pages/manager/Tenants.jsx'
import TenantDetail from './pages/manager/TenantDetail.jsx'
import Approvals from './pages/manager/Approvals.jsx'
import Payments from './pages/manager/Payments.jsx'
import ManagerNotifications from './pages/manager/Notifications.jsx'
import Reminders from './pages/manager/Reminders.jsx'
import Maintenance from './pages/manager/Maintenance.jsx'
import Finances from './pages/manager/Finances.jsx'
import Payroll from './pages/manager/Payroll.jsx'
import Settings from './pages/manager/Settings.jsx'
import Plan from './pages/manager/Plan.jsx'
import Demo from './pages/manager/Demo.jsx'
import Branding from './pages/manager/Branding.jsx'
import Team from './pages/manager/Team.jsx'

import TenantLayout from './pages/tenant/TenantLayout.jsx'
import TenantDashboard from './pages/tenant/Dashboard.jsx'
import SubmitPayment from './pages/tenant/SubmitPayment.jsx'
import PaymentHistory from './pages/tenant/PaymentHistory.jsx'
import TenantNotifications from './pages/tenant/Notifications.jsx'
import TenantMaintenance from './pages/tenant/Maintenance.jsx'
import AdminLayout from './pages/admin/AdminLayout.jsx'
import AdminOverview from './pages/admin/AdminOverview.jsx'
import AdminWorkspaces from './pages/admin/AdminWorkspaces.jsx'
import AdminSubscriptions from './pages/admin/AdminSubscriptions.jsx'
import AdminFees from './pages/admin/AdminFees.jsx'
import AdminUsers from './pages/admin/AdminUsers.jsx'

function RequireRole({ role, children }) {
  const { loading, session } = useAuth()
  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to={role === 'manager' ? '/manager/auth' : '/tenant/login'} replace />
  if (session.role !== role) return <Navigate to="/" replace />
  return children
}

// The platform owner (RentLoja HQ) — sees subscriptions & revenue, not a workspace.
function RequireAdmin({ children }) {
  const { loading, session, profile } = useAuth()
  if (loading) return <LoadingScreen />
  if (!session || session.role !== 'manager') return <Navigate to="/manager/auth" replace />
  if (!profile) return <LoadingScreen />
  if (!profile.platform_admin) return <Navigate to="/manager" replace />
  return children
}

export default function App() {
  const { loading, session, profile } = useAuth()
  if (loading) return <LoadingScreen />

  const home = !session ? null
    : session.role !== 'manager' ? '/tenant'
    : profile?.platform_admin ? '/admin' : '/manager'

  return (
    <Routes>
      {/* Landing role picker */}
      <Route path="/" element={home ? <Navigate to={home} replace /> : <RolePicker />} />

      {/* Platform admin */}
      <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
        <Route index element={<AdminOverview />} />
        <Route path="workspaces" element={<AdminWorkspaces />} />
        <Route path="subscriptions" element={<AdminSubscriptions />} />
        <Route path="fees" element={<AdminFees />} />
        <Route path="users" element={<AdminUsers />} />
      </Route>

      {/* Auth */}
      <Route path="/manager/auth" element={session ? <Navigate to="/manager" replace /> : <ManagerAuth />} />
      <Route path="/tenant/login" element={session ? <Navigate to="/tenant" replace /> : <TenantLogin />} />
      <Route path="/reset-password" element={<ResetPassword />} />

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
        <Route path="reminders" element={<Reminders />} />
        <Route path="maintenance" element={<Maintenance />} />
        <Route path="finances" element={<Finances />} />
        <Route path="payroll" element={<Payroll />} />
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
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
