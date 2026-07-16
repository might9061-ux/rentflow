// ═══════════════════════════════════════════════════════════════════════════
// Data facade. One API for the whole app.
//
//   • No Supabase env vars  → delegates to the localStorage mock (demo mode).
//   • Supabase configured    → delegates to the real backend (tables + RPCs).
//
// Every method returns rows using the SQL column names (snake_case) so the UI
// is identical across both backends.
// ═══════════════════════════════════════════════════════════════════════════

import { supabase, isSupabaseConfigured } from './supabaseClient.js'
import { mockApi, genTempPassword, resetDemo } from './mockDb.js'
import { capacityFor } from './pricing.js'
import { createApiDb } from './apiDb.js'

export const DEMO_MODE = !isSupabaseConfigured
export { genTempPassword, resetDemo }

// Convenience: throw on a Supabase error.
function ok(res) {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

// Resolve a login identifier (email OR phone) to the account email Supabase
// auth needs. A phone is looked up via the `email_for_login` RPC (SECURITY
// DEFINER, returns the matching account email or null).
async function resolveLoginEmail(identifier) {
  const id = (identifier || '').trim()
  if (id.includes('@')) return id
  const email = ok(await supabase.rpc('email_for_login', { p_phone: id }))
  if (!email) throw new Error('No account found for that phone number.')
  return email
}

// ── Supabase implementation ─────────────────────────────────────────────────
const sb = {
  async signUpManager({ email, password, first_name, last_name, phone, country }) {
    // Phone already in use? (email_for_login maps a phone to its account email.)
    if (phone) {
      const { data: takenBy } = await supabase.rpc('email_for_login', { p_phone: phone })
      if (takenBy) throw new Error('An account already uses that phone number. Please sign in instead, or use a different number.')
    }

    const data = ok(await supabase.auth.signUp({
      email, password,
      options: {
        data: { role: 'manager', first_name, last_name, phone, country: country || 'ZW' },
        // Where the confirmation link lands the user back in the app.
        emailRedirectTo: window.location.origin + '/manager/auth',
      },
    }))

    // Supabase hides "already registered" (so strangers can't probe for accounts):
    // it returns a user with an EMPTY identities array instead of an error. Catch
    // that so we say so plainly rather than showing a "check your email" screen
    // for a mail that will never arrive.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error('An account with this email already exists. Please sign in instead — or use “Forgot password?” if you’ve forgotten it.')
    }

    // Trigger handle_new_manager() creates the profile row. When the project has
    // email confirmation on, no session is returned until the user clicks the
    // verification link — surface that so the UI can show "check your email".
    return { id: data.user?.id, email, needsVerification: !data.session }
  },
  // Re-send the sign-up confirmation email (e.g. if it expired or was lost).
  async resendVerification(email) {
    ok(await supabase.auth.resend({
      type: 'signup',
      email: (email || '').trim(),
      options: { emailRedirectTo: window.location.origin + '/manager/auth' },
    }))
    return { emailed: true }
  },
  async signInManager({ email, identifier, password }) {
    const em = await resolveLoginEmail(identifier ?? email)
    const data = ok(await supabase.auth.signInWithPassword({ email: em, password }))
    // The login can succeed while the workspace profile is missing (e.g. the
    // account predates the database, or the signup trigger failed). Without
    // this check the app would silently sign them straight back out.
    const res = await supabase.from('managers').select('id').eq('id', data.user.id).maybeSingle()
    if (res.error) throw new Error(res.error.message)
    if (!res.data) {
      await supabase.auth.signOut()
      throw new Error('Your password is correct, but this account has no manager workspace set up. If you’re a tenant, use the tenant sign-in instead. Otherwise email support@rentloja.com and we’ll finish setting it up.')
    }
    return { id: data.user.id }
  },
  async signInTenant({ email, identifier, password }) {
    const em = await resolveLoginEmail(identifier ?? email)
    const data = ok(await supabase.auth.signInWithPassword({ email: em, password }))
    // Use maybeSingle so a non-tenant login gives a clear message instead of the
    // raw "Cannot coerce…" PostgREST error.
    const res = await supabase.from('tenants').select('first_login').eq('id', data.user.id).maybeSingle()
    if (res.error) throw new Error(res.error.message)
    if (!res.data) {
      await supabase.auth.signOut()
      throw new Error('This login isn’t a tenant account. If you’re a property manager, use the manager sign-in page.')
    }
    return { id: data.user.id, first_login: res.data.first_login }
  },
  // Quick unlock relies on the persisted Supabase session (auth tokens live in
  // storage); the PIN / passkey gate is enforced client-side before reuse.
  async quickUnlockSession({ userId, role }) { return { id: userId, role } },
  async signOut() { await supabase.auth.signOut() },
  // Unified shape consumed by AuthContext: { userId, role } | null
  async resolveSession() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    const userId = session.user.id
    // Role is derived from which profile table owns the id.
    const mgr = await supabase.from('managers').select('id').eq('id', userId).maybeSingle()
    if (mgr.data) return { userId, role: 'manager' }
    const ten = await supabase.from('tenants').select('id').eq('id', userId).maybeSingle()
    if (ten.data) return { userId, role: 'tenant' }
    // A valid token but no profile in either table. If the lookups genuinely
    // succeeded (account deleted) clear the stale token. Either way return null
    // so the app shows the login screen instead of an endless spinner — this is
    // what happens when the database tables don't exist yet.
    // EXCEPTION: during password recovery the user legitimately holds a session
    // with no profile lookup yet — signing out here would break the reset page.
    const onRecovery = typeof window !== 'undefined' && window.location?.pathname === '/reset-password'
    if (!onRecovery && !mgr.error && !ten.error) { try { await supabase.auth.signOut() } catch { /* ignore */ } }
    return null
  },
  onAuthChange(cb) {
    const { data } = supabase.auth.onAuthStateChange(() => cb())
    return () => data.subscription.unsubscribe()
  },

  // Real Supabase can't reveal account contacts (privacy/RLS), so recovery
  // always goes through the registered email's secure link.
  async lookupResetTargets(email) {
    return { found: true, role: null, email: (email || '').trim(), phone: null }
  },
  // Real Supabase emails a recovery link that lands on /reset-password.
  async requestPasswordReset(email) {
    ok(await supabase.auth.resetPasswordForEmail((email || '').trim(), {
      redirectTo: window.location.origin + '/reset-password',
    }))
    return { emailed: true }
  },
  // Completed on the /reset-password page once the recovery session is active.
  async completePasswordReset(_email, _code, newPassword) {
    ok(await supabase.auth.updateUser({ password: newPassword }))
    return {}
  },

  // Change password while signed in. Re-authenticates with the current
  // password to verify identity, then updates it.
  async changePassword(_userId, currentPassword, newPassword) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not signed in.')
    const check = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword })
    if (check.error) throw new Error('Current password is incorrect.')
    ok(await supabase.auth.updateUser({ password: newPassword }))
    return {}
  },

  async requestOtp(tenantId, channel) { ok(await supabase.rpc('request_otp', { p_tenant_id: tenantId, p_channel: channel })); return {} },
  async verifyOtp(tenantId, channel, code) { return ok(await supabase.rpc('verify_otp', { p_tenant_id: tenantId, p_channel: channel, p_code: code })) },
  async setTenantPassword(_tenantId, newPassword) { ok(await supabase.auth.updateUser({ password: newPassword })) },
  async completeFirstLogin(tenantId) { ok(await supabase.rpc('complete_first_login', { p_tenant_id: tenantId })); return this.getTenant(tenantId) },

  async getManager(id) { return ok(await supabase.from('managers').select('*').eq('id', id).single()) },
  async updateManagerSettings(managerId, patch) {
    return ok(await supabase.from('managers').update(patch).eq('id', managerId).select().single())
  },

  // ── team / staff managers ──────────────────────────────────────────────────
  // The owner id is resolved server-side; staff scoping is enforced by RLS.
  async listTeam(ownerId) {
    return ok(await supabase.from('managers').select('*').eq('owner_id', ownerId).eq('role', 'staff').order('created_at', { ascending: false }))
  },
  async createStaff(ownerId, data) {
    // Invites a staff manager and returns a one-time password (Edge Function
    // creates the auth user with ANTHROPIC/Supabase admin key server-side).
    return ok(await supabase.functions.invoke('create-staff', { body: { owner_id: ownerId, ...data } }))
  },
  async updateStaff(staffId, patch) {
    return ok(await supabase.from('managers').update(patch).eq('id', staffId).select().single())
  },
  async resendStaffCredentials(staffId) {
    return ok(await supabase.functions.invoke('reset-staff-password', { body: { staff_id: staffId } }))
  },
  async removeStaff(staffId) {
    return ok(await supabase.from('managers').delete().eq('id', staffId))
  },

  // ── automated rent reminders ────────────────────────────────────────────────
  async getWorkspaceManager(userId) {
    const me = ok(await supabase.from('managers').select('owner_id').eq('id', userId).single())
    const ownerId = me?.owner_id || userId
    return ok(await supabase.from('managers').select('*').eq('id', ownerId).single())
  },
  async listReminderLog(userId) {
    const wm = await this.getWorkspaceManager(userId)
    return ok(await supabase.from('reminder_log').select('*').eq('manager_id', wm.id).order('created_at', { ascending: false }))
  },
  async logReminderSent(userId, entry) {
    const wm = await this.getWorkspaceManager(userId)
    return ok(await supabase.from('reminder_log').insert({ manager_id: wm.id, ...entry }).select().single())
  },
  // A daily Edge Function cron computes & sends these server-side; this client
  // count is best-effort for the nav badge.
  async dueRemindersCount(userId) {
    const { computeDueReminders, remindersEnabled } = await import('./reminders.js')
    const [wm, tenants, payments, properties, log] = await Promise.all([
      this.getWorkspaceManager(userId), this.listTenants(userId), this.listPayments(userId),
      this.listProperties(userId), this.listReminderLog(userId),
    ])
    if (!remindersEnabled(wm)) return 0
    return computeDueReminders({ tenants, payments, properties, manager: wm, log }).length
  },
  async snoozeReminder(userId, tenantId) {
    const { currentPeriod } = await import('./billing.js')
    const [wm, t] = await Promise.all([this.getWorkspaceManager(userId), this.getTenant(tenantId)])
    const period = currentPeriod(Number(t.due_day) || 1).from
    return ok(await supabase.from('reminder_log').upsert(
      { manager_id: wm.id, tenant_id: tenantId, rule_id: 'snooze', period, channel: '-', amount: 0 },
      { onConflict: 'manager_id,tenant_id,rule_id,period' }))
  },
  async cancelSnooze(userId, tenantId) {
    const { currentPeriod } = await import('./billing.js')
    const [wm, t] = await Promise.all([this.getWorkspaceManager(userId), this.getTenant(tenantId)])
    const period = currentPeriod(Number(t.due_day) || 1).from
    return ok(await supabase.from('reminder_log').delete()
      .eq('manager_id', wm.id).eq('tenant_id', tenantId).eq('rule_id', 'snooze').eq('period', period))
  },
  async setReminderMuted(userId, tenantId, muted) {
    return ok(await supabase.from('tenants').update({ reminders_muted: !!muted }).eq('id', tenantId).select().single())
  },
  async recordSubscriptionPayment(managerId, data) {
    return ok(await supabase.from('subscription_payments').insert({ manager_id: managerId, ...data }).select().single())
  },
  async listSubscriptionPayments(managerId) {
    return ok(await supabase.from('subscription_payments').select('*').eq('manager_id', managerId).order('created_at', { ascending: false }))
  },
  // ── payroll (owner-only; RLS restricts to the workspace owner) ──────────────
  async listPayees(userId) {
    const wm = await this.getWorkspaceManager(userId)
    return ok(await supabase.from('payees').select('*').eq('manager_id', wm.id).order('created_at', { ascending: false }))
  },
  async createPayee(userId, data) {
    const wm = await this.getWorkspaceManager(userId)
    return ok(await supabase.from('payees').insert({ manager_id: wm.id, ...data, amount: Number(data.amount) || 0, active: true }).select().single())
  },
  async updatePayee(id, patch) {
    return ok(await supabase.from('payees').update(patch).eq('id', id).select().single())
  },
  async deletePayee(id) { return ok(await supabase.from('payees').delete().eq('id', id)) },
  async listPayroll(userId) {
    const wm = await this.getWorkspaceManager(userId)
    return ok(await supabase.from('payroll').select('*').eq('manager_id', wm.id).order('created_at', { ascending: false }))
  },
  // RPC inserts the payroll row + its Salaries expense atomically server-side.
  async payStaff(userId, payeeId, data) {
    return ok(await supabase.rpc('pay_staff', { p_payee_id: payeeId, p_amount: Number(data.amount) || 0, p_period: data.period || '', p_method: data.method || 'Bank Transfer', p_paid_on: data.paid_on || null, p_note: data.note || '' }))
  },

  // Platform admin overview. RLS must restrict these tables to platform_admin.
  async adminOverview() {
    const { platformFee } = await import('./fees.js')
    const [owners, agents, subs, tenants, approved] = await Promise.all([
      ok(await supabase.from('managers').select('id,first_name,last_name,brand_name,email,country,plan_active,plan_capacity,plan_price,created_at').eq('role', 'owner').neq('platform_admin', true)),
      ok(await supabase.from('managers').select('id,owner_id').eq('role', 'staff')),
      ok(await supabase.from('subscription_payments').select('*').order('created_at', { ascending: false })),
      ok(await supabase.from('tenants').select('manager_id')),
      ok(await supabase.from('payments').select('manager_id,amount,fee,approved_at,paid_date,created_at').eq('status', 'approved')),
    ])
    const name = (m) => `${m?.first_name || ''} ${m?.last_name || ''}`.trim() || '—'
    const workspaces = owners.map((m) => {
      const ws = subs.filter((s) => s.manager_id === m.id)
      const volume = approved.filter((p) => p.manager_id === m.id).reduce((s, p) => s + Number(p.amount), 0)
      return { id: m.id, name: name(m), company: m.brand_name || name(m), email: m.email, country: m.country || 'ZW',
        plan_active: !!m.plan_active, plan_capacity: Number(m.plan_capacity) || 0, plan_price: Number(m.plan_price) || 0,
        tenants: tenants.filter((t) => t.manager_id === m.id).length,
        agents: agents.filter((a) => a.owner_id === m.id).length,
        total_paid: ws.reduce((s, x) => s + Number(x.amount), 0), payments: ws.length,
        rent_volume: volume, fees: platformFee(volume),
        last_payment_at: ws[0]?.created_at || null, joined_at: m.created_at }
    }).sort((a, b) => b.total_paid - a.total_paid)
    const subscriptionRevenue = subs.reduce((s, x) => s + Number(x.amount), 0)
    const transactionVolume = approved.reduce((s, p) => s + Number(p.amount), 0)
    const transactionFees = platformFee(transactionVolume)
    return {
      subscriptionRevenue, transactionVolume, transactionFees,
      totalRevenue: subscriptionRevenue + transactionFees,
      mrr: owners.filter((o) => o.plan_active).reduce((s, o) => s + (Number(o.plan_price) || 0), 0),
      activeSubs: owners.filter((o) => o.plan_active).length, totalWorkspaces: owners.length,
      users: { tenants: tenants.length, managers: owners.length, agents: agents.length },
      subscriptions: subs.map((s) => ({ created_at: s.created_at, amount: Number(s.amount), manager_id: s.manager_id })),
      transactions: approved.map((p) => ({ created_at: p.approved_at || p.paid_date || p.created_at, amount: Number(p.amount), fee: p.fee != null ? Number(p.fee) : platformFee(p.amount), manager_id: p.manager_id })),
      workspaces, recentPayments: subs.slice(0, 15).map((p) => ({ ...p, workspace: name(owners.find((o) => o.id === p.manager_id)) })),
    }
  },
  async adminUsers() {
    const [owners, agents, tenants] = await Promise.all([
      ok(await supabase.from('managers').select('id,first_name,last_name,brand_name').eq('role', 'owner').neq('platform_admin', true)),
      ok(await supabase.from('managers').select('id,owner_id').eq('role', 'staff')),
      ok(await supabase.from('tenants').select('manager_id')),
    ])
    const name = (m) => `${m?.first_name || ''} ${m?.last_name || ''}`.trim() || '—'
    const perCompany = owners.map((o) => ({ id: o.id, company: o.brand_name || name(o), manager: name(o),
      agents: agents.filter((a) => a.owner_id === o.id).length, tenants: tenants.filter((t) => t.manager_id === o.id).length }))
      .sort((a, b) => (b.tenants + b.agents) - (a.tenants + a.agents))
    return { totals: { tenants: tenants.length, managers: owners.length, agents: agents.length },
      total: tenants.length + owners.length + agents.length, perCompany }
  },
  // ── refunds ─────────────────────────────────────────────────────────────────
  async refundPayment(userId, paymentId, data = {}) {
    return ok(await supabase.rpc('refund_payment', { p_payment_id: paymentId, p_amount: data.amount ?? null, p_reason: data.reason || '', p_method: data.method || null, p_refunded_on: data.refunded_on || null }))
  },
  async listRefunds(userId) {
    const wm = await this.getWorkspaceManager(userId)
    return ok(await supabase.from('refunds').select('*').eq('manager_id', wm.id).order('created_at', { ascending: false }))
  },
  async adminSubscriptions() {
    const [owners, subs] = await Promise.all([
      ok(await supabase.from('managers').select('id,first_name,last_name,brand_name,plan_active,plan_price').eq('role', 'owner').neq('platform_admin', true)),
      ok(await supabase.from('subscription_payments').select('*').order('created_at', { ascending: false })),
    ])
    const name = (m) => `${m?.first_name || ''} ${m?.last_name || ''}`.trim() || '—'
    const payments = subs.map((p) => { const o = owners.find((x) => x.id === p.manager_id); return { ...p, workspace: name(o), company: o?.brand_name || name(o) } })
    return { total: subs.reduce((s, x) => s + Number(x.amount), 0), count: subs.length,
      mrr: owners.filter((o) => o.plan_active).reduce((s, o) => s + (Number(o.plan_price) || 0), 0), payments }
  },
  async adminTransactions() {
    const { platformFee } = await import('./fees.js')
    const [owners, tenants, approved] = await Promise.all([
      ok(await supabase.from('managers').select('id,first_name,last_name,brand_name').eq('role', 'owner').neq('platform_admin', true)),
      ok(await supabase.from('tenants').select('id,first_name,last_name')),
      ok(await supabase.from('payments').select('id,manager_id,tenant_id,amount,fee,method,approved_at,paid_date,created_at').eq('status', 'approved').order('created_at', { ascending: false })),
    ])
    const name = (m) => `${m?.first_name || ''} ${m?.last_name || ''}`.trim() || '—'
    const company = (o) => o?.brand_name || name(o)
    const payments = approved.map((p) => { const o = owners.find((x) => x.id === p.manager_id); return { id: p.id, manager_id: p.manager_id, created_at: p.approved_at || p.paid_date || p.created_at,
      amount: Number(p.amount), fee: p.fee != null ? Number(p.fee) : platformFee(p.amount), method: p.method,
      workspace: company(o), manager: name(o), tenant: name(tenants.find((t) => t.id === p.tenant_id)) } })
    const byWorkspace = owners.map((m) => {
      const ws = approved.filter((p) => p.manager_id === m.id)
      const volume = ws.reduce((s, p) => s + Number(p.amount), 0)
      return { id: m.id, name: company(m), manager: name(m), volume, fees: platformFee(volume), count: ws.length }
    }).filter((w) => w.count > 0).sort((a, b) => b.fees - a.fees)
    return { totalVolume: payments.reduce((s, r) => s + r.amount, 0), totalFees: payments.reduce((s, r) => s + r.fee, 0),
      count: payments.length, byWorkspace, payments }
  },
  async logTenantQuestion(managerId, tenantId, { question, answer }) {
    ok(await supabase.from('tenant_questions').insert({ manager_id: managerId, tenant_id: tenantId, question, answer }))
  },
  async listTenantQuestions(managerId) {
    return ok(await supabase.from('tenant_questions').select('*').eq('manager_id', managerId).order('created_at', { ascending: false }))
  },
  async tenantQuestionsUnread(managerId) {
    const rows = ok(await supabase.from('tenant_questions').select('id').eq('manager_id', managerId).eq('read_by_manager', false))
    return rows.length
  },
  async markTenantQuestionsRead(managerId) {
    ok(await supabase.from('tenant_questions').update({ read_by_manager: true }).eq('manager_id', managerId).eq('read_by_manager', false))
  },
  async getTenantManager(tenantId) {
    const t = ok(await supabase.from('tenants').select('manager_id').eq('id', tenantId).single())
    return ok(await supabase.from('managers').select('*').eq('id', t.manager_id).single())
  },

  async listProperties(managerId) { return ok(await supabase.from('properties').select('*').eq('manager_id', managerId).order('created_at')) },
  async createProperty(managerId, data) { return ok(await supabase.from('properties').insert({ manager_id: managerId, ...data }).select().single()) },
  async updateProperty(id, patch) { return ok(await supabase.from('properties').update(patch).eq('id', id).select().single()) },
  async deleteProperty(id) { ok(await supabase.from('properties').delete().eq('id', id)) },

  async listExpenses(managerId) { return ok(await supabase.from('expenses').select('*').eq('manager_id', managerId).order('spent_on', { ascending: false })) },
  async createExpense(managerId, data) { return ok(await supabase.from('expenses').insert({ manager_id: managerId, ...data }).select().single()) },
  async deleteExpense(id) { ok(await supabase.from('expenses').delete().eq('id', id)) },

  // ── maintenance / repair requests ───────────────────────────────────────────
  async listMaintenance(_userId) { return ok(await supabase.from('maintenance').select('*').order('created_at', { ascending: false })) },
  async listTenantMaintenance(tenantId) { return ok(await supabase.from('maintenance').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })) },
  async getMaintenance(id) { return ok(await supabase.from('maintenance').select('*').eq('id', id).single()) },
  async createMaintenanceRequest(_tenantId, data) {
    // Manager_id, property_id and unit are derived from the tenant in a trigger.
    return ok(await supabase.rpc('create_maintenance', { p_title: data.title, p_category: data.category || 'General', p_description: data.description || '', p_photo_url: data.photo_url || null, p_priority: data.priority || 'normal' }))
  },
  async updateMaintenance(id, patch) { return ok(await supabase.from('maintenance').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single()) },
  async maintenanceOpenCount(_userId) { return ok(await supabase.from('maintenance').select('id', { count: 'exact', head: true }).neq('status', 'resolved')).length || 0 },

  async listTenants(managerId) { return ok(await supabase.from('tenants').select('*').eq('manager_id', managerId).order('created_at')) },
  async getTenant(id) { return ok(await supabase.from('tenants').select('*').eq('id', id).single()) },
  async createTenant(managerId, data) {
    // Enforce plan capacity (the create_tenant RPC also enforces this server-side).
    const [manager, existing] = await Promise.all([this.getManager(managerId), this.listTenants(managerId)])
    const cap = capacityFor(manager)
    if (existing.length >= cap) {
      throw new Error(manager?.plan_active
        ? `You've reached your plan limit of ${cap} tenants. Upgrade your plan to add more.`
        : `You need an active plan to add tenants. Subscribe and pay an installment to continue.`)
    }
    // The create-tenant Edge Function creates the tenant's auth account WITH the
    // temp password (service_role admin API) and the profile row, then returns
    // both. This is what lets the tenant actually sign in with the temp password.
    const res = ok(await supabase.functions.invoke('create-tenant', {
      body: {
        property_id: data.property_id || null, first_name: data.first_name, last_name: data.last_name,
        email: data.email, phone: data.phone, unit: data.unit, rent: Number(data.rent),
        due_day: Number(data.due_day), lease_start: data.lease_start || null,
      },
    }))
    const tenant = await this.getTenant(res.tenant_id)
    return { tenant, tempPassword: res.temp_password }
  },
  async updateTenant(id, patch) { return ok(await supabase.from('tenants').update(patch).eq('id', id).select().single()) },
  async resendCredentials(tenantId) {
    const tempPassword = genTempPassword()
    ok(await supabase.from('tenants').update({ first_login: true, email_verified: false, phone_verified: false, account_status: 'pending_verification' }).eq('id', tenantId))
    // Edge Function resets the auth password to tempPassword in production.
    return { tempPassword }
  },

  async listPayments(managerId, { status } = {}) {
    let q = supabase.from('payments').select('*').eq('manager_id', managerId).order('created_at', { ascending: false })
    if (status) q = q.eq('status', status)
    return ok(await q)
  },
  async listTenantPayments(tenantId) { return ok(await supabase.from('payments').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })) },
  async submitPayment(tenantId, data) {
    return ok(await supabase.from('payments').insert({ tenant_id: tenantId, ...data, status: 'pending' }).select().single())
  },
  // Online payments are confirmed server-side by the gateway webhook/Edge
  // Function (which flips status → approved + issues a receipt). The client
  // inserts the pending record; RLS forbids the client approving it directly.
  async submitOnlinePayment(tenantId, data) {
    return ok(await supabase.from('payments')
      .insert({ tenant_id: tenantId, ...data, paid_online: true, status: 'pending' })
      .select().single())
  },
  async approvePayment(paymentId) {
    ok(await supabase.rpc('approve_payment', { p_payment_id: paymentId }))
    return ok(await supabase.from('payments').select('*').eq('id', paymentId).single())
  },
  async rejectPayment(paymentId, reason) { ok(await supabase.rpc('reject_payment', { p_payment_id: paymentId, p_reason: reason || null })) },
  // Manager logs a payment (e.g. cash) → inserted then auto-approved server-side.
  async recordCashPayment(tenantId, data) {
    const t = ok(await supabase.from('tenants').select('manager_id').eq('id', tenantId).single())
    const p = ok(await supabase.from('payments').insert({
      tenant_id: tenantId, manager_id: t.manager_id, ...data, status: 'pending', paid_online: false, recorded_by: 'manager',
    }).select().single())
    ok(await supabase.rpc('approve_payment', { p_payment_id: p.id }))
    return ok(await supabase.from('payments').select('*').eq('id', p.id).single())
  },

  async listNotifications(managerId) { return ok(await supabase.from('notifications').select('*').eq('manager_id', managerId).order('created_at', { ascending: false })) },
  async createNotification(managerId, data) { return ok(await supabase.from('notifications').insert({ manager_id: managerId, ...data }).select().single()) },
  async notificationStats(notificationId) {
    const reads = ok(await supabase.from('notification_reads').select('*', { count: 'exact', head: true }).eq('notification_id', notificationId))
    return { read: reads?.length ?? 0, total: 0 } // total computed client-side from tenant set if needed
  },
  async listTenantNotifications(tenantId) {
    const notifs = ok(await supabase.from('notifications').select('*').order('created_at', { ascending: false }))
    const reads = ok(await supabase.from('notification_reads').select('notification_id').eq('tenant_id', tenantId))
    const readSet = new Set(reads.map((r) => r.notification_id))
    return notifs.map((n) => ({ ...n, read: readSet.has(n.id) }))
  },
  async unreadCount(tenantId) { return (await this.listTenantNotifications(tenantId)).filter((n) => !n.read).length },
  async markNotificationRead(notificationId) { ok(await supabase.rpc('mark_notification_read', { p_notification_id: notificationId })) },
}

// The active backend:
//   • no Supabase env      → localStorage demo mock
//   • VITE_API_URL set     → the RentLoja API server (/server) for core + admin
//                            actions, falling back to Supabase for the rest
//   • Supabase only        → the browser talks to Supabase directly
const API_URL = import.meta.env.VITE_API_URL?.trim()
export const db = !isSupabaseConfigured
  ? mockApi
  : API_URL
    ? createApiDb(sb)
    : sb
