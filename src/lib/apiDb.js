// ═══════════════════════════════════════════════════════════════════════════
// API-backed data facade.
//
// When VITE_API_URL is set, the app talks to the RentLoja API server (/server)
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
  if (!resp.ok) {
    const msg = json?.error || `${resp.status} ${resp.statusText}`
    // Account suspended mid-session: end the session so the app returns to the
    // sign-in screen instead of sitting on a page full of failed requests.
    if (resp.status === 403 && /suspended/i.test(msg)) {
      try { await supabase.auth.signOut() } catch { /* already gone */ }
    }
    throw new Error(msg)
  }
  return json
}

export function createApiDb(sb) {
  return {
    ...sb, // auth, session, OTP, password, reminders, payroll, refunds, admin dashboards → direct Supabase

    // ── sign-in: routed through the API so it can broker the mandatory
    // emailed code — the browser never gets a session until the code is
    // verified. Overrides the direct-Supabase versions spread in above.
    signInManager: ({ email, identifier, password }) =>
      req('POST', '/api/login-otp/start', { role: 'manager', identifier: identifier ?? email, password }),
    signInTenant: ({ email, identifier, password }) =>
      req('POST', '/api/login-otp/start', { role: 'tenant', identifier: identifier ?? email, password }),
    async verifyLoginOtp({ challengeId, code }) {
      const { access_token, refresh_token, first_login } = await req('POST', '/api/login-otp/verify', { challenge_id: challengeId, code })
      const { data, error } = await supabase.auth.setSession({ access_token, refresh_token })
      if (error) throw new Error(error.message)
      return { id: data.user.id, first_login }
    },
    resendLoginOtp: (challengeId) => req('POST', '/api/login-otp/resend', { challenge_id: challengeId }),

    // ── managers / team ──────────────────────────────────────────────────────
    updateManagerSettings: (_managerId, patch) => req('PATCH', '/api/managers/me', patch),
    // Agent first-login: set their own password (client-side Supabase, like every
    // other password op here), then clear first_login through the API so it runs
    // under the server's write path rather than a direct table update.
    async completeAgentFirstLogin(_userId, newPassword) {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw new Error(error.message)
      return req('PATCH', '/api/managers/me', { first_login: false })
    },
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
    deleteTenant: (id) => req('DELETE', `/api/tenants/${id}`),

    // ── payments ─────────────────────────────────────────────────────────────
    listPayments: (_managerId, { status } = {}) =>
      req('GET', `/api/payments${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    listTenantPayments: (tenantId) => req('GET', `/api/payments/tenant/${tenantId}`),
    submitPayment: (_tenantId, data) => req('POST', '/api/payments', data),
    approvePayment: (paymentId) => req('POST', `/api/payments/${paymentId}/approve`),
    rejectPayment: (paymentId, reason) => req('POST', `/api/payments/${paymentId}/reject`, { reason }),
    recordCashPayment: (tenantId, data) => req('POST', '/api/payments/log', { tenant_id: tenantId, ...data }),

    // ── online-payment gateway (owner connects Paynow / Pesepay) ───────────────
    // Status only comes back (never the secret keys). id arg is ignored — the
    // server derives the workspace owner from the caller.
    getPaymentGateway: (_managerId) => req('GET', '/api/payment-gateway'),
    savePaymentGateway: (_managerId, patch) => req('PUT', '/api/payment-gateway', patch),
    disconnectPaymentGateway: (_managerId) => req('DELETE', '/api/payment-gateway'),
    // Tenant-side: run a REAL gateway payment. start → { payment, redirectUrl?, instructions? };
    // then poll status until { state: 'paid' | 'cancelled' | 'pending' }.
    startGatewayPayment: (data) => req('POST', '/api/payments/gateway/start', data),
    gatewayPaymentStatus: (paymentId) => req('GET', `/api/payments/gateway/status/${paymentId}`),
    // Re-check pending online payments against the gateway (settles/expires
    // abandoned ones). Safe to call on a payments page load.
    reconcilePayments: () => req('POST', '/api/payments/reconcile'),

    // ── leases ─────────────────────────────────────────────────────────────────
    listLeases: (_managerId, tenantId) => req('GET', `/api/leases${tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : ''}`),
    listMyLeases: (_tenantId) => req('GET', '/api/leases/mine'),
    createLease: (_managerId, data) => req('POST', '/api/leases', data),
    updateLease: (id, patch) => req('PATCH', `/api/leases/${id}`, patch),
    deleteLease: (id) => req('DELETE', `/api/leases/${id}`),
    signLease: (id, name) => req('POST', `/api/leases/${id}/sign`, { name }),

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
    // Pay the subscription into the PLATFORM's Pesepay: start → { payment,
    // redirectUrl?, instructions? }; poll status until paid → the plan activates.
    startSubscriptionPayment: (data) => req('POST', '/api/subscriptions/gateway/start', data),
    subscriptionPaymentStatus: (id) => req('GET', `/api/subscriptions/gateway/status/${id}`),

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
    adminAudit: () => req('GET', '/api/platform/audit'),
    adminAdmins: () => req('GET', '/api/platform/admins'),
    // Role-scoped password reset: only sends if the email is registered on the
    // side (manager/tenant) the request came from. Returns { available }.
    requestPasswordReset: (email, role) => req('POST', '/api/auth/request-reset', { email, role }),
    // Report a sign-in so a new device triggers an alert email.
    reportLogin: () => req('POST', '/api/login-events'),
    listLoginDevices: () => req('GET', '/api/login-events/devices'),
    // Turn a workspace's plan on/off. Since 0019 managers can't do this
    // themselves, so this is the only path — service-role, admin-gated.
    adminSetPlan: (workspaceId, patch) => req('PATCH', `/api/platform/workspaces/${workspaceId}/plan`, patch),
    // App-owner only: deactivate/reactivate a whole workspace (reversible, no data loss).
    adminSetWorkspaceStatus: (workspaceId, active) => req('PATCH', `/api/platform/workspaces/${workspaceId}/status`, { active }),
    // A specific workspace's subscription payments (with references).
    adminWorkspacePayments: (workspaceId) => req('GET', `/api/platform/workspaces/${workspaceId}/subscriptions`),
    // Record money actually received — what drives "Subs paid" and revenue.
    adminRecordPayment: (workspaceId, payment) => req('POST', `/api/platform/workspaces/${workspaceId}/payment`, payment),
    // Self-serve plan start. TEMPORARY until Paynow gates it behind a real charge.
    startOwnPlan: (capacity, opts) => req('POST', '/api/managers/me/plan', { capacity, trial: opts?.trial === true, cycle: opts?.cycle }),
    cancelOwnPlan: () => req('POST', '/api/managers/me/plan/cancel', {}),
    resumeOwnPlan: () => req('POST', '/api/managers/me/plan/resume', {}),
    deleteOwnAccount: ({ password, role } = {}) => req('POST', role === 'tenant' ? '/api/tenants/me/delete' : '/api/managers/me/delete', { password }),

    // ── tenant questions (AI) ─────────────────────────────────────────────────────
    logTenantQuestion: (_managerId, _tenantId, { question, answer }) => req('POST', '/api/tenant-questions', { question, answer }),
    listTenantQuestions: () => req('GET', '/api/tenant-questions'),
    async tenantQuestionsUnread() { const r = await req('GET', '/api/tenant-questions/unread'); return r.unread || 0 },
    markTenantQuestionsRead: () => req('POST', '/api/tenant-questions/read'),

    // ── messages (tenant ↔ manager, and owner ↔ agent) ───────────────────
    // A tenant or agent has one conversation and passes no party id; the
    // server takes it from their own row rather than trusting the client.
    listMessages: (_userId, partyId) =>
      req('GET', `/api/messages${partyId ? `?party_id=${encodeURIComponent(partyId)}` : ''}`),
    listMessageThreads: () => req('GET', '/api/messages/threads'),
    async messagesUnread() { const r = await req('GET', '/api/messages/unread'); return r.unread || 0 },
    sendMessage: (_userId, { partyId, body, fromAssistant }) =>
      req('POST', '/api/messages', { party_id: partyId, body, from_assistant: !!fromAssistant }),
    editMessage: (_userId, id, body) => req('POST', `/api/messages/${id}/edit`, { body }),
    deleteMessage: (_userId, id) => req('POST', `/api/messages/${id}/delete`),
    markMessagesRead: (_userId, partyId) => req('POST', '/api/messages/read', { party_id: partyId }),

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
