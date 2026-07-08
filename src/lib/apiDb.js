// ═══════════════════════════════════════════════════════════════════════════
// API-backed data facade.
//
// When VITE_API_URL is set, the app talks to the MightyRent API server (/server)
// for the core resources and the privileged account-creating actions, instead
// of hitting Supabase directly from the browser. Auth/session, OTP, password
// and a few derived/among specialised helpers stay on the Supabase SDK (they
// belong client-side), so this adapter is built ON TOP of the direct-Supabase
// object `sb`: it spreads `sb` and overrides only the methods it routes.
//
// The caller's Supabase session token is forwarded on every request; the server
// runs each operation under that user's Row Level Security.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from './supabaseClient.js'

const BASE = (import.meta.env.VITE_API_URL?.trim() || '').replace(/\/$/, '')

async function req(method, path, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  const resp = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const text = await resp.text()
  const json = text ? JSON.parse(text) : null
  if (!resp.ok) throw new Error(json?.error || `${resp.status} ${resp.statusText}`)
  return json
}

export function createApiDb(sb) {
  return {
    ...sb, // auth, session, OTP, password, reminders, payroll, refunds, admin dashboards → direct Supabase

    // ── managers / team ──────────────────────────────────────────────────────
    updateManagerSettings: (_managerId, patch) => req('PATCH', '/api/managers/me', patch),
    listTeam: () => req('GET', '/api/managers/team'),
    updateStaff: (staffId, patch) => req('PATCH', `/api/managers/team/${staffId}`, patch),
    removeStaff: (staffId) => req('DELETE', `/api/managers/team/${staffId}`),

    // ── privileged: create accounts (this is what makes temp passwords work) ──
    async createTenant(_managerId, data) {
      const r = await req('POST', '/api/admin/tenants', data)
      const tenant = await this.getTenant(r.tenant_id)
      return { tenant, tempPassword: r.temp_password }
    },
    resendCredentials: async (tenantId) => {
      const r = await req('POST', `/api/admin/tenants/${tenantId}/resend-credentials`)
      return { tempPassword: r.tempPassword }
    },
    async createStaff(_ownerId, data) {
      const r = await req('POST', '/api/admin/staff', data)
      return { ...r, staffId: r.staff_id, tempPassword: r.temp_password }
    },
    resendStaffCredentials: (staffId) => req('POST', `/api/admin/staff/${staffId}/reset-password`),

    // ── properties ───────────────────────────────────────────────────────────
    listProperties: () => req('GET', '/api/properties'),
    createProperty: (_managerId, data) => req('POST', '/api/properties', data),
    updateProperty: (id, patch) => req('PATCH', `/api/properties/${id}`, patch),
    deleteProperty: (id) => req('DELETE', `/api/properties/${id}`),

    // ── tenants (create lives above; the rest here) ─────────────────────────
    listTenants: () => req('GET', '/api/tenants'),
    getTenant: (id) => req('GET', `/api/tenants/${id}`),
    updateTenant: (id, patch) => req('PATCH', `/api/tenants/${id}`, patch),

    // ── payments ─────────────────────────────────────────────────────────────
    listPayments: (_managerId, { status } = {}) =>
      req('GET', `/api/payments${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    listTenantPayments: (tenantId) => req('GET', `/api/payments/tenant/${tenantId}`),
    submitPayment: (_tenantId, data) => req('POST', '/api/payments', data),
    approvePayment: (paymentId) => req('POST', `/api/payments/${paymentId}/approve`),
    rejectPayment: (paymentId, reason) => req('POST', `/api/payments/${paymentId}/reject`, { reason }),
    recordCashPayment: (tenantId, data) => req('POST', '/api/payments/log', { tenant_id: tenantId, ...data }),

    // ── notifications ────────────────────────────────────────────────────────
    listNotifications: () => req('GET', '/api/notifications'),
    createNotification: (_managerId, data) => req('POST', '/api/notifications', data),
    markNotificationRead: (id) => req('POST', `/api/notifications/${id}/read`),

    // ── expenses ─────────────────────────────────────────────────────────────
    listExpenses: () => req('GET', '/api/expenses'),
    createExpense: (_managerId, data) => req('POST', '/api/expenses', data),
    deleteExpense: (id) => req('DELETE', `/api/expenses/${id}`),

    // ── maintenance ──────────────────────────────────────────────────────────
    listMaintenance: () => req('GET', '/api/maintenance'),
    listTenantMaintenance: () => req('GET', '/api/maintenance'),
    createMaintenanceRequest: (_tenantId, data) => req('POST', '/api/maintenance', data),
    updateMaintenance: (id, patch) => req('PATCH', `/api/maintenance/${id}`, patch),
    async getMaintenance(id) {
      const all = await req('GET', '/api/maintenance')
      const m = all.find((x) => x.id === id)
      if (!m) throw new Error('Not found')
      return m
    },
    async maintenanceOpenCount() {
      const all = await req('GET', '/api/maintenance')
      return all.filter((m) => m.status !== 'resolved').length
    },

    // ── managers (reads) + workspace ───────────────────────────────────────────
    getManager: () => req('GET', '/api/managers/me'),
    getWorkspaceManager: () => req('GET', '/api/managers/workspace'),
    getTenantManager: () => req('GET', '/api/tenants/me/manager'),

    // ── reminders ──────────────────────────────────────────────────────────────
    listReminderLog: () => req('GET', '/api/reminders/log'),
    logReminderSent: (_userId, entry) => req('POST', '/api/reminders/log', entry),
    setReminderMuted: (_userId, tenantId, muted) => req('PATCH', `/api/tenants/${tenantId}`, { reminders_muted: !!muted }),
    async snoozeReminder(_userId, tenantId) {
      const { currentPeriod } = await import('./billing.js')
      const t = await this.getTenant(tenantId)
      const period = currentPeriod(Number(t.due_day) || 1).from
      return req('POST', '/api/reminders/snooze', { tenant_id: tenantId, period })
    },
    async cancelSnooze(_userId, tenantId) {
      const { currentPeriod } = await import('./billing.js')
      const t = await this.getTenant(tenantId)
      const period = currentPeriod(Number(t.due_day) || 1).from
      return req('DELETE', '/api/reminders/snooze', { tenant_id: tenantId, period })
    },

    // ── subscription (plan) payments ────────────────────────────────────────────
    recordSubscriptionPayment: (_managerId, data) => req('POST', '/api/subscriptions', data),
    listSubscriptionPayments: () => req('GET', '/api/subscriptions'),

    // ── payroll ──────────────────────────────────────────────────────────────────
    listPayees: () => req('GET', '/api/payroll/payees'),
    createPayee: (_userId, data) => req('POST', '/api/payroll/payees', data),
    updatePayee: (id, patch) => req('PATCH', `/api/payroll/payees/${id}`, patch),
    deletePayee: (id) => req('DELETE', `/api/payroll/payees/${id}`),
    listPayroll: () => req('GET', '/api/payroll'),
    payStaff: (_userId, payeeId, data) => req('POST', `/api/payroll/pay/${payeeId}`, data),

    // ── refunds ──────────────────────────────────────────────────────────────────
    listRefunds: () => req('GET', '/api/refunds'),
    refundPayment: (_userId, paymentId, data = {}) => req('POST', `/api/refunds/${paymentId}`, data),

    // ── platform admin dashboards ────────────────────────────────────────────────
    adminOverview: () => req('GET', '/api/platform/overview'),
    adminUsers: () => req('GET', '/api/platform/users'),
    adminSubscriptions: () => req('GET', '/api/platform/subscriptions'),
    adminTransactions: () => req('GET', '/api/platform/transactions'),

    // ── tenant questions (AI) ─────────────────────────────────────────────────────
    logTenantQuestion: (_managerId, _tenantId, { question, answer }) => req('POST', '/api/tenant-questions', { question, answer }),
    listTenantQuestions: () => req('GET', '/api/tenant-questions'),
    async tenantQuestionsUnread() { const r = await req('GET', '/api/tenant-questions/unread'); return r.unread || 0 },
    markTenantQuestionsRead: () => req('POST', '/api/tenant-questions/read'),

    // ── tenant first-login / OTP ──────────────────────────────────────────────────
    async requestOtp(_tenantId, channel) { await req('POST', '/api/otp/request', { channel }); return {} },
    verifyOtp: (_tenantId, channel, code) => req('POST', '/api/otp/verify', { channel, code }),
    async completeFirstLogin(tenantId) { await req('POST', '/api/otp/first-login-complete'); return this.getTenant(tenantId) },

    // ── payments (online) + notifications (tenant side) ────────────────────────────
    submitOnlinePayment: (_tenantId, data) => req('POST', '/api/payments/online', data),
    listTenantNotifications: () => req('GET', '/api/notifications/tenant'),
    async unreadCount() { const r = await req('GET', '/api/notifications/unread-count'); return r.unread || 0 },
  }
}
