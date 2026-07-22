// ═══════════════════════════════════════════════════════════════════════════
// Mock backend — a fully-functional, localStorage-backed implementation of the
// RentLoja data API. Used automatically when Supabase env vars are absent so
// the app runs end-to-end with zero credentials and seeded demo data.
//
// ⚠️  Demo only: passwords are stored in plaintext in localStorage. The real
//     Supabase backend (see lib/db.js supabase branch) handles auth securely.
// ═══════════════════════════════════════════════════════════════════════════

import { uid } from './format.js'
import { applyPayment, periodForDate, currentPeriod } from './billing.js'
import { capacityFor } from './pricing.js'
import { computeArrears } from './arrears.js'
import { computeDueReminders, remindersEnabled } from './reminders.js'
import { marketFor } from './markets.js'
import { platformFee } from './fees.js'

const KEY = 'rentflow_db_v1'
const SESSION_KEY = 'rentflow_session_v1'

// ── persistence ─────────────────────────────────────────────────────────────
function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) { /* ignore */ }
  const seeded = seed()
  localStorage.setItem(KEY, JSON.stringify(seeded))
  return seeded
}
function save(db) { localStorage.setItem(KEY, JSON.stringify(db)) }
function db() { return load() }

// Resolve a user's workspace scope. The OWNER (account holder) sees everything
// in their workspace; an assigned STAFF member sees only the properties the
// owner gave them — and the tenants / payments / expenses inside those.
// All workspace data is stored under the owner's id (manager_id = ownerId).
function scopeOf(d, userId) {
  const m = d.managers.find((x) => x.id === userId)
  const ownerId = (m && m.owner_id) || userId
  const isStaff = m?.role === 'staff'
  const propIds = isStaff ? new Set(m.assigned_property_ids || []) : null
  return { m, ownerId, isStaff, propIds }
}

// Can the CURRENT signed-in user access this tenant record? A tenant may read
// only their own row; a manager/staff only tenants inside their workspace scope.
// This guards direct by-id access (e.g. typing another workspace's tenant URL).
function canSeeTenant(d, t) {
  if (!t) return false
  const s = getSession()
  if (!s) return true // no session (tooling/seed) — don't block
  if (s.role === 'tenant') return t.id === s.userId
  const { ownerId, isStaff, propIds } = scopeOf(d, s.userId)
  if (t.manager_id !== ownerId) return false
  return !isStaff || (!!t.property_id && propIds.has(t.property_id))
}

// Match an account by EITHER email or phone number. Phones are compared on
// their last 9 significant digits, so 0772000111, 263772000111 and
// +263 772 000 111 all resolve to the same person.
function matchByIdentifier(list, identifier) {
  const id = (identifier || '').trim().toLowerCase()
  if (!id) return null
  if (id.includes('@')) return list.find((x) => (x.email || '').toLowerCase() === id) || null
  const tail = id.replace(/\D/g, '').slice(-9)
  if (tail.length < 7) return null
  return list.find((x) => (x.phone || '').replace(/\D/g, '').slice(-9) === tail) || null
}

// Only the owner of a staff member may manage them.
function ownsStaff(d, s) {
  if (!s) return false
  const sess = getSession()
  if (!sess) return true
  const { ownerId } = scopeOf(d, sess.userId)
  return s.role === 'staff' && s.owner_id === ownerId
}

export function resetDemo() {
  localStorage.removeItem(KEY)
  localStorage.removeItem(SESSION_KEY)
}

const clone = (x) => JSON.parse(JSON.stringify(x))
const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms))

// ── temp password generator: TEMP-XXXX ─────────────────────────────────────
export function genTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return `TEMP-${s}`
}

// ── session ─────────────────────────────────────────────────────────────────
function setSession(s) {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s))
  else localStorage.removeItem(SESSION_KEY)
  authListeners.forEach((cb) => cb(s))
}
function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) } catch { return null }
}
const authListeners = new Set()

// ═══════════════════════════════════════════════════════════════════════════
//  API
// ═══════════════════════════════════════════════════════════════════════════
export const mockApi = {
  // ── auth ──────────────────────────────────────────────────────────────────
  async signUpManager({ email, password, first_name, last_name, phone, country }) {
    await delay()
    const d = db()
    email = email.toLowerCase().trim()
    if (d.managers.some((m) => m.email === email))
      throw new Error('An account with this email already exists.')
    const id = uid()
    const c = country || 'ZW'
    d.managers.push({
      id, role: 'owner', owner_id: null, account_status: 'active',
      first_name, last_name, email, phone, password,
      country: c, currency: marketFor(c).currency, currencies: [marketFor(c).currency],
      late_fee_enabled: false, late_fee_type: 'flat', late_fee_amount: 0, late_fee_grace_days: 3,
      accepted_methods: null, payment_details: {}, notify_on_tenant_ai: false,
      ai_enabled_self: true, ai_enabled_tenants: true,
      plan_capacity: null, plan_price: null, plan_active: false, plan_started_at: null,
      onboarded: false, created_at: new Date().toISOString(),
    })
    save(d)
    setSession({ userId: id, role: 'manager' })
    return { id }
  },

  // Demo mode has no real email — sign-up signs you straight in, so there's
  // nothing to resend. Kept for API parity with the Supabase backend.
  async resendVerification(email) { await delay(); return { emailed: true } },

  async signInManager({ email, identifier, password }) {
    await delay()
    const d = db()
    const m = matchByIdentifier(d.managers, identifier ?? email)
    if (!m || m.password !== password) throw new Error('Invalid login or password.')
    if (m.account_status === 'suspended') throw new Error('Your access has been suspended. Contact the account owner.')
    setSession({ userId: m.id, role: 'manager' })
    return { id: m.id }
  },

  async signInTenant({ email, identifier, password }) {
    await delay()
    const d = db()
    const t = matchByIdentifier(d.tenants, identifier ?? email)
    if (!t) throw new Error('No tenant account found for that phone or email.')
    // Accept either the temp password (first login) or the permanent password.
    const ok = (t.first_login && t.temp_password === password) || (t.password && t.password === password)
    if (!ok) throw new Error('Invalid login or password.')
    setSession({ userId: t.id, role: 'tenant' })
    return { id: t.id, first_login: t.first_login }
  },

  // Restore a session after a successful quick unlock (PIN / fingerprint) on a
  // device that previously signed in. Verification happens client-side first.
  async quickUnlockSession({ userId, role }) {
    await delay(40)
    const d = db()
    const exists = role === 'tenant'
      ? d.tenants.find((x) => x.id === userId)
      : d.managers.find((x) => x.id === userId && x.account_status !== 'suspended')
    if (!exists) throw new Error('This saved account is no longer available. Please sign in.')
    setSession({ userId, role })
    return { id: userId, role }
  },

  async signOut() { await delay(40); setSession(null) },

  // Demo mode has no real tokens; the mock session restore above is enough.
  async currentSessionTokens() { return null },
  onSessionTokens() { return () => {} },

  getSessionRaw() { return getSession() },
  // Unified shape consumed by AuthContext: { userId, role } | null
  async resolveSession() { return getSession() },
  onAuthChange(cb) { authListeners.add(cb); return () => authListeners.delete(cb) },

  // ── tenant verification ─────────────────────────────────────────────────
  async requestOtp(tenantId, channel) {
    await delay()
    const d = db()
    const code = String(Math.floor(100000 + Math.random() * 900000))
    d.otps = d.otps.filter((o) => !(o.tenant_id === tenantId && o.channel === channel))
    d.otps.push({ id: uid(), tenant_id: tenantId, channel, code, expires_at: Date.now() + 10 * 60000 })
    save(d)
    // SMS/email stub — surface the code so the demo is usable.
    console.info(`[RentLoja demo] OTP (${channel}) for tenant ${tenantId}: ${code}`)
    return { code } // returned so the UI can show it in demo mode
  },

  async verifyOtp(tenantId, channel, code) {
    await delay()
    const d = db()
    const o = d.otps.find((x) => x.tenant_id === tenantId && x.channel === channel && x.code === code)
    if (!o || o.expires_at < Date.now()) return false
    d.otps = d.otps.filter((x) => x !== o)
    const t = d.tenants.find((x) => x.id === tenantId)
    if (channel === 'email') t.email_verified = true
    else t.phone_verified = true
    save(d)
    return true
  },

  async setTenantPassword(tenantId, newPassword) {
    await delay()
    const d = db()
    const t = d.tenants.find((x) => x.id === tenantId)
    t.password = newPassword
    t.temp_password = null
    save(d)
  },

  // Mirrors the finish_password_reset() RPC: acts on whoever is signed in, and
  // deliberately never un-suspends anyone.
  async finishPasswordReset() {
    const d = db()
    const s = getSession()
    const t = s?.userId ? d.tenants.find((x) => x.id === s.userId) : null
    if (!t) return   // manager, or nobody signed in
    t.first_login = false
    t.email_verified = true
    if (t.account_status === 'pending_verification') t.account_status = 'active'
    if (t.status === 'pending') t.status = 'due'
    save(d)
  },
  async completeFirstLogin(tenantId) {
    await delay()
    const d = db()
    const t = d.tenants.find((x) => x.id === tenantId)
    t.first_login = false
    t.account_status = 'active'
    if (t.status === 'pending') t.status = 'due'
    save(d)
    return clone(t)
  },

  // ── password reset (works for both managers & tenants) ────────────────────
  // Look up which REGISTERED contacts a reset code can be sent to. The code is
  // only ever delivered to the email/phone on the account — never a number the
  // user types in.
  async lookupResetTargets(email) {
    await delay(60)
    const d = db()
    email = (email || '').toLowerCase().trim()
    const mgr = d.managers.find((m) => m.email === email)
    const ten = d.tenants.find((t) => t.email === email)
    const acct = mgr || ten
    if (!acct) throw new Error('No account found for that email.')
    return {
      found: true,
      role: mgr ? 'manager' : 'tenant',
      email: acct.email,
      phone: acct.phone || null,
    }
  },

  // Demo: generates a 6-digit code (returned so the UI can show it) and "sends"
  // it to the chosen REGISTERED channel. Real Supabase emails a reset link.
  async requestPasswordReset(email, channel = 'email') {
    await delay()
    const d = db()
    email = (email || '').toLowerCase().trim()
    const mgr = d.managers.find((m) => m.email === email)
    const ten = d.tenants.find((t) => t.email === email)
    const acct = mgr || ten
    if (!acct) throw new Error('No account found for that email.')
    if (channel === 'phone' && !acct.phone)
      throw new Error('No phone number is registered on this account.')
    const code = String(Math.floor(100000 + Math.random() * 900000))
    d.resets = (d.resets || []).filter((r) => r.email !== email)
    d.resets.push({ email, code, expires_at: Date.now() + 10 * 60000 })
    save(d)
    const target = channel === 'phone' ? acct.phone : acct.email
    console.info(`[RentLoja demo] Password reset code for ${email} via ${channel} (${target}): ${code}`)
    return { code, role: mgr ? 'manager' : 'tenant', channel, target }
  },

  // Change password while signed in — verifies the current password first.
  async changePassword(userId, currentPassword, newPassword) {
    await delay()
    const d = db()
    const acct = d.managers.find((m) => m.id === userId) || d.tenants.find((t) => t.id === userId)
    if (!acct) throw new Error('Account not found.')
    const current = acct.password || acct.temp_password
    if (current !== currentPassword) throw new Error('Current password is incorrect.')
    if (currentPassword === newPassword) throw new Error('New password must be different.')
    acct.password = newPassword
    if ('temp_password' in acct) acct.temp_password = null
    save(d)
  },

  async completePasswordReset(email, code, newPassword) {
    await delay()
    const d = db()
    email = (email || '').toLowerCase().trim()
    const r = (d.resets || []).find((x) => x.email === email && x.code === code && x.expires_at > Date.now())
    if (!r) throw new Error('Invalid or expired code.')
    const mgr = d.managers.find((m) => m.email === email)
    const ten = d.tenants.find((t) => t.email === email)
    if (mgr) mgr.password = newPassword
    if (ten) { ten.password = newPassword; ten.temp_password = null }
    d.resets = (d.resets || []).filter((x) => x !== r)
    save(d)
    return { role: mgr ? 'manager' : 'tenant' }
  },

  // ── managers ──────────────────────────────────────────────────────────────
  async getManager(id) { await delay(40); const m = db().managers.find((x) => x.id === id); return m ? stripSecret(m) : null },
  async getTenantManager(tenantId) {
    const d = db(); const t = d.tenants.find((x) => x.id === tenantId)
    const m = t && d.managers.find((x) => x.id === t.manager_id)
    return m ? stripSecret(m) : null
  },
  async updateManagerSettings(managerId, patch) {
    await delay(); const d = db()
    const m = d.managers.find((x) => x.id === managerId)
    const keys = ['avatar', 'accepted_methods', 'payment_details', 'notify_on_tenant_ai',
      'ai_enabled_self', 'ai_enabled_tenants', 'country', 'currency', 'currencies',
      'late_fee_enabled', 'late_fee_type', 'late_fee_amount', 'late_fee_grace_days',
      'reminders_enabled', 'reminder_channel', 'reminder_rules', 'refunds_enabled',
      'plan_capacity', 'plan_price', 'plan_active', 'plan_started_at', 'onboarded', 'billing_card',
      'brand_name', 'brand_logo', 'brand_color']
    keys.forEach((k) => { if (k in patch) m[k] = patch[k] })
    save(d); return stripSecret(m)
  },

  // The workspace OWNER's manager record (reminder rules, branding etc. live here).
  async getWorkspaceManager(userId) {
    await delay(30); const d = db(); const { ownerId } = scopeOf(d, userId)
    const m = d.managers.find((x) => x.id === ownerId)
    return m ? stripSecret(m) : null
  },

  // ── automated rent reminders ──────────────────────────────────────────────
  async listReminderLog(userId) {
    await delay(30); const d = db(); const { ownerId } = scopeOf(d, userId)
    return (d.reminder_log || []).filter((l) => l.manager_id === ownerId).sort(byCreatedDesc).map(clone)
  },
  async logReminderSent(userId, entry) {
    await delay(20); const d = db(); const { ownerId } = scopeOf(d, userId)
    d.reminder_log = d.reminder_log || []
    const e = {
      id: uid(), manager_id: ownerId, tenant_id: entry.tenant_id, rule_id: entry.rule_id,
      period: entry.period, channel: entry.channel || 'whatsapp', amount: Number(entry.amount) || 0,
      created_at: new Date().toISOString(),
    }
    // Mirror the live behaviour: a sent reminder also lands in the tenant's
    // in-app inbox, so the demo shows what really happens.
    if (entry.message && entry.tenant_id) {
      d.notifications.push({
        id: uid(), manager_id: ownerId, recipient_scope: 'individual',
        property_id: null, tenant_id: entry.tenant_id,
        subject: entry.subject || 'Rent reminder', message: entry.message,
        priority: entry.kind === 'overdue' ? 'urgent' : entry.kind === 'upcoming' ? 'info' : 'normal',
        created_at: new Date().toISOString(),
      })
    }
    d.reminder_log.push(e); save(d); return clone(e)
  },
  // Skip a tenant for the CURRENT billing period only (they return next period).
  async snoozeReminder(userId, tenantId) {
    await delay(20); const d = db(); const { ownerId } = scopeOf(d, userId)
    const t = d.tenants.find((x) => x.id === tenantId)
    const period = currentPeriod(Number(t?.due_day) || 1).from
    d.reminder_log = d.reminder_log || []
    if (!d.reminder_log.some((l) => l.manager_id === ownerId && l.tenant_id === tenantId && l.rule_id === 'snooze' && l.period === period)) {
      d.reminder_log.push({ id: uid(), manager_id: ownerId, tenant_id: tenantId, rule_id: 'snooze', period, channel: '-', amount: 0, created_at: new Date().toISOString() })
      save(d)
    }
    return { ok: true }
  },
  async cancelSnooze(userId, tenantId) {
    await delay(20); const d = db(); const { ownerId } = scopeOf(d, userId)
    const t = d.tenants.find((x) => x.id === tenantId)
    const period = currentPeriod(Number(t?.due_day) || 1).from
    d.reminder_log = (d.reminder_log || []).filter((l) => !(l.manager_id === ownerId && l.tenant_id === tenantId && l.rule_id === 'snooze' && l.period === period))
    save(d); return { ok: true }
  },
  // Mute a tenant entirely (opt out) until un-muted.
  async setReminderMuted(userId, tenantId, muted) {
    await delay(20); const d = db()
    const t = d.tenants.find((x) => x.id === tenantId)
    if (t) { t.reminders_muted = !!muted; save(d) }
    return t ? stripSecret(t) : null
  },
  async dueRemindersCount(userId) {
    await delay(20); const d = db(); const { ownerId, isStaff, propIds } = scopeOf(d, userId)
    const manager = d.managers.find((x) => x.id === ownerId)
    if (!remindersEnabled(manager)) return 0
    const tenants = d.tenants.filter((t) => t.manager_id === ownerId && (!isStaff || (t.property_id && propIds.has(t.property_id))))
    const payments = d.payments.filter((p) => p.manager_id === ownerId)
    const properties = d.properties.filter((p) => p.manager_id === ownerId)
    const log = (d.reminder_log || []).filter((l) => l.manager_id === ownerId)
    return computeDueReminders({ tenants, payments, properties, manager, log }).length
  },

  // ── team / staff managers ─────────────────────────────────────────────────
  // The owner can invite other managers and assign each to specific properties.
  async listTeam(userId) {
    await delay(40); const d = db(); const { ownerId } = scopeOf(d, userId)
    return d.managers.filter((m) => m.role === 'staff' && m.owner_id === ownerId).sort(byCreatedDesc).map(stripSecret)
  },
  async createStaff(userId, data) {
    await delay(); const d = db(); const { ownerId } = scopeOf(d, userId)
    const email = (data.email || '').toLowerCase().trim()
    if (!email) throw new Error('Email is required.')
    if (d.managers.some((m) => m.email === email)) throw new Error('An account with this email already exists.')
    const tempPassword = genTempPassword()
    const owner = d.managers.find((m) => m.id === ownerId)
    const s = {
      id: uid(), role: 'staff', owner_id: ownerId,
      first_name: data.first_name, last_name: data.last_name, email, phone: data.phone || '',
      password: tempPassword, must_change: true,
      country: owner?.country || 'ZW', currency: owner?.currency || 'USD', currencies: owner?.currencies || ['USD'], // inherit the workspace market
      assigned_property_ids: data.assigned_property_ids || [],
      can_payroll: !!data.can_payroll,
      account_status: 'active',
      accepted_methods: null, payment_details: {}, notify_on_tenant_ai: false,
      ai_enabled_self: true, ai_enabled_tenants: true,
      plan_capacity: null, plan_price: null, plan_active: false, onboarded: true,
      created_at: new Date().toISOString(),
    }
    d.managers.push(s); save(d)
    return { staff: stripSecret(s), tempPassword }
  },
  async updateStaff(staffId, patch) {
    await delay(); const d = db()
    const s = d.managers.find((x) => x.id === staffId)
    if (!s || !ownsStaff(d, s)) throw new Error('Team member not found.')
    const allowed = ['first_name', 'last_name', 'phone', 'assigned_property_ids', 'account_status', 'can_payroll']
    allowed.forEach((k) => { if (k in patch) s[k] = patch[k] })
    save(d); return stripSecret(s)
  },
  async resendStaffCredentials(staffId) {
    await delay(); const d = db()
    const s = d.managers.find((x) => x.id === staffId)
    if (!s || !ownsStaff(d, s)) throw new Error('Team member not found.')
    const tempPassword = genTempPassword()
    s.password = tempPassword; s.must_change = true; save(d)
    return { tempPassword }
  },
  async removeStaff(staffId) {
    await delay(); const d = db()
    const s = d.managers.find((x) => x.id === staffId)
    if (!s || !ownsStaff(d, s)) throw new Error('Team member not found.')
    d.managers = d.managers.filter((m) => m.id !== staffId); save(d)
  },

  // ── subscription / installment payments ───────────────────────────────────
  async recordSubscriptionPayment(managerId, data) {
    await delay(); const d = db()
    d.sub_payments = d.sub_payments || []
    const p = {
      id: uid(), manager_id: managerId, amount: Number(data.amount) || 0,
      period: data.period || '', method: data.method || '', reference: data.reference || '',
      created_at: new Date().toISOString(),
    }
    d.sub_payments.push(p); save(d); return clone(p)
  },
  async listSubscriptionPayments(managerId) {
    await delay(40); const d = db()
    return (d.sub_payments || []).filter((p) => p.manager_id === managerId).sort(byCreatedDesc).map(clone)
  },

  // ── payroll — staff/caretakers the owner pays (owner-only) ──────────────────
  async listPayees(userId) {
    await delay(40); const d = db(); const { ownerId } = scopeOf(d, userId)
    return (d.payees || []).filter((p) => p.manager_id === ownerId).sort(byCreatedDesc).map(clone)
  },
  async createPayee(userId, data) {
    await delay(); const d = db(); const { ownerId } = scopeOf(d, userId)
    d.payees = d.payees || []
    const p = { id: uid(), manager_id: ownerId, name: data.name, category: data.category || 'Other', pay_type: data.pay_type || 'monthly', title: data.title || '', amount: Number(data.amount) || 0, phone: data.phone || '', active: true, created_at: new Date().toISOString() }
    d.payees.push(p); save(d); return clone(p)
  },
  async updatePayee(id, patch) {
    await delay(); const d = db(); const p = (d.payees || []).find((x) => x.id === id)
    if (!p) throw new Error('Person not found.')
    const allowed = ['name', 'category', 'pay_type', 'title', 'amount', 'phone', 'active']
    allowed.forEach((k) => { if (k in patch) p[k] = patch[k] })
    if ('amount' in patch) p.amount = Number(patch.amount) || 0
    save(d); return clone(p)
  },
  async deletePayee(id) {
    await delay(); const d = db()
    d.payees = (d.payees || []).filter((p) => p.id !== id); save(d)
  },
  async listPayroll(userId) {
    await delay(40); const d = db(); const { ownerId } = scopeOf(d, userId)
    return (d.payroll || []).filter((p) => p.manager_id === ownerId).sort(byCreatedDesc).map(clone)
  },
  // Pay a person → records the payment AND mirrors it into Finances as an expense.
  async payStaff(userId, payeeId, data) {
    await delay(); const d = db(); const { ownerId } = scopeOf(d, userId)
    const payee = (d.payees || []).find((x) => x.id === payeeId)
    const name = data.name || payee?.name || 'Staff'
    const category = data.category || payee?.category || ''
    const amount = Number(data.amount) || 0
    const period = data.period || ''
    const paid_on = data.paid_on || new Date().toISOString().slice(0, 10)
    const exId = uid()
    d.expenses = d.expenses || []
    d.expenses.push({ id: exId, manager_id: ownerId, property_id: data.property_id || null, category: 'Salaries', amount, spent_on: paid_on, note: `Salary: ${name}${category ? ` (${category})` : ''}${period ? ` — ${period}` : ''}`, created_at: new Date().toISOString() })
    d.payroll = d.payroll || []
    const rec = { id: uid(), manager_id: ownerId, payee_id: payeeId, name, category, amount, period, method: data.method || 'Bank Transfer', paid_on, note: data.note || '', expense_id: exId, created_at: new Date().toISOString() }
    d.payroll.push(rec); save(d); return clone(rec)
  },

  // ── refunds (only if the manager has refunds turned on) ─────────────────────
  async refundPayment(userId, paymentId, data = {}) {
    await delay(); const d = db(); const { ownerId } = scopeOf(d, userId)
    const mgr = d.managers.find((m) => m.id === ownerId)
    if (!mgr?.refunds_enabled) throw new Error('Refunds are turned off for this workspace.')
    const p = d.payments.find((x) => x.id === paymentId)
    if (!p) throw new Error('Payment not found.')
    if (p.refunded) throw new Error('This payment has already been refunded.')
    const t = d.tenants.find((x) => x.id === p.tenant_id)
    const amount = Math.min(Number(data.amount) || Number(p.amount), Number(p.amount))
    const refunded_on = data.refunded_on || new Date().toISOString().slice(0, 10)
    p.refunded = true; p.refunded_amount = amount; p.refunded_at = new Date().toISOString()
    if (t) t.total_paid = Math.max(0, Number(t.total_paid) - amount)
    // Mirror to Finances as a Refund expense (money out).
    const exId = uid(); const who = t ? `${t.first_name} ${t.last_name}`.trim() : 'tenant'
    d.expenses = d.expenses || []
    d.expenses.push({ id: exId, manager_id: ownerId, property_id: t?.property_id || null, category: 'Refund', amount, spent_on: refunded_on, note: `Refund: ${who}${data.reason ? ` — ${data.reason}` : ''}`, created_at: new Date().toISOString() })
    d.refunds = d.refunds || []
    const rec = { id: uid(), manager_id: ownerId, payment_id: paymentId, tenant_id: p.tenant_id, amount, reason: data.reason || '', method: data.method || p.method, refunded_on, expense_id: exId, created_at: new Date().toISOString() }
    d.refunds.push(rec); save(d); return clone(rec)
  },
  async listRefunds(userId) {
    await delay(40); const d = db(); const { ownerId, isStaff, propIds } = scopeOf(d, userId)
    let rows = (d.refunds || []).filter((r) => r.manager_id === ownerId)
    if (isStaff) { const tById = new Map(d.tenants.map((t) => [t.id, t])); rows = rows.filter((r) => { const t = tById.get(r.tenant_id); return t && t.property_id && propIds.has(t.property_id) }) }
    return rows.sort(byCreatedDesc).map(clone)
  },

  // ── platform admin (RentLoja owner) — all subscriptions & revenue ───────────
  async adminOverview() {
    await delay(80); const d = db()
    const name = (m) => `${m?.first_name || ''} ${m?.last_name || ''}`.trim() || '—'
    const owners = d.managers.filter((m) => m.role === 'owner' && !m.platform_admin)
    const subs = d.sub_payments || []
    const approved = (d.payments || []).filter((p) => p.status === 'approved')

    const workspaces = owners.map((m) => {
      const ws = subs.filter((s) => s.manager_id === m.id).sort(byCreatedDesc)
      const volume = approved.filter((p) => p.manager_id === m.id).reduce((s, p) => s + Number(p.amount), 0)
      return {
        id: m.id, name: name(m), company: m.brand_name || name(m), email: m.email, country: m.country || 'ZW',
        plan_active: !!m.plan_active, plan_capacity: Number(m.plan_capacity) || 0, plan_price: Number(m.plan_price) || 0,
        tenants: d.tenants.filter((t) => t.manager_id === m.id).length,
        agents: d.managers.filter((x) => x.role === 'staff' && x.owner_id === m.id).length,
        total_paid: ws.reduce((s, x) => s + Number(x.amount), 0),
        payments: ws.length, last_payment_at: ws[0]?.created_at || null,
        rent_volume: volume, fees: platformFee(volume),
        joined_at: m.created_at,
      }
    }).sort((a, b) => b.total_paid - a.total_paid)

    const recentPayments = subs.slice().sort(byCreatedDesc).slice(0, 15).map((p) => ({
      ...clone(p), workspace: name(owners.find((o) => o.id === p.manager_id)),
    }))

    const subscriptionRevenue = subs.reduce((s, x) => s + Number(x.amount), 0)
    const transactionVolume = approved.reduce((s, p) => s + Number(p.amount), 0)
    const transactionFees = platformFee(transactionVolume)

    return {
      subscriptionRevenue, transactionVolume, transactionFees,
      totalRevenue: subscriptionRevenue + transactionFees,
      mrr: owners.filter((o) => o.plan_active).reduce((s, o) => s + (Number(o.plan_price) || 0), 0),
      activeSubs: owners.filter((o) => o.plan_active).length,
      totalWorkspaces: owners.length,
      users: { tenants: d.tenants.length, managers: owners.length, agents: d.managers.filter((m) => m.role === 'staff').length },
      // Raw (lightweight) rows so the views can scope by time-frame & compare months.
      subscriptions: subs.map((s) => ({ created_at: s.created_at, amount: Number(s.amount), manager_id: s.manager_id })),
      transactions: approved.map((p) => ({ created_at: p.approved_at || p.paid_date || p.created_at, amount: Number(p.amount), fee: p.fee != null ? Number(p.fee) : platformFee(p.amount), manager_id: p.manager_id })),
      workspaces, recentPayments,
    }
  },

  // People using the app — totals + per-company breakdown (admin).
  async adminUsers() {
    await delay(50); const d = db()
    const name = (m) => `${m?.first_name || ''} ${m?.last_name || ''}`.trim() || '—'
    const owners = d.managers.filter((m) => m.role === 'owner' && !m.platform_admin)
    const agents = d.managers.filter((m) => m.role === 'staff')
    const perCompany = owners.map((o) => ({
      id: o.id, company: o.brand_name || name(o), manager: name(o),
      agents: agents.filter((a) => a.owner_id === o.id).length,
      tenants: d.tenants.filter((t) => t.manager_id === o.id).length,
    })).sort((a, b) => (b.tenants + b.agents) - (a.tenants + a.agents))
    return {
      totals: { tenants: d.tenants.length, managers: owners.length, agents: agents.length },
      total: d.tenants.length + owners.length + agents.length,
      perCompany,
    }
  },

  // All subscription payments across the platform (admin).
  // Turn a workspace's plan on/off (demo equivalent of the admin endpoint).
  async adminSetPlan(workspaceId, patch) {
    await delay(60); const d = db()
    const m = d.managers.find((x) => x.id === workspaceId)
    if (!m) throw new Error('Workspace not found.')
    if (patch.plan_active !== undefined) m.plan_active = !!patch.plan_active
    if (patch.plan_capacity !== undefined) m.plan_capacity = Math.max(0, Math.floor(Number(patch.plan_capacity) || 0))
    if (patch.plan_price !== undefined) m.plan_price = Math.max(0, Number(patch.plan_price) || 0)
    if (m.plan_active && !m.plan_started_at) m.plan_started_at = new Date().toISOString()
    save(d)
    return clone(m)
  },
  // Self-serve plan start (demo equivalent of POST /api/managers/me/plan).
  async startOwnPlan(capacity) {
    await delay(60); const d = db()
    const s = getSession(); if (!s) throw new Error('Not signed in.')
    const m = d.managers.find((x) => x.id === s.userId)
    if (!m) throw new Error('Workspace not found.')
    const cap = Math.floor(Number(capacity) || 0)
    if (cap < 1) throw new Error('Choose how many tenants you need.')
    const tenants = d.tenants.filter((t) => t.manager_id === m.id).length
    if (cap < tenants) throw new Error(`You already have ${tenants} tenants — choose at least that many.`)
    const TIERS = [[5, 10], [20, 20], [50, 40], [100, 50], [Infinity, 70]]
    m.plan_capacity = cap
    m.plan_price = (TIERS.find(([upTo]) => cap <= upTo) || TIERS[TIERS.length - 1])[1]
    m.plan_active = true
    m.onboarded = true
    if (!m.plan_started_at) m.plan_started_at = new Date().toISOString()
    save(d)
    return clone(m)
  },
  // Record money actually received from a landlord (demo equivalent).
  async adminRecordPayment(workspaceId, { amount, method, reference, period } = {}) {
    await delay(60); const d = db()
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) throw new Error('Enter a valid amount.')
    const monthLabel = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    const row = { id: 'sub-' + Math.random().toString(36).slice(2, 9), manager_id: workspaceId,
      amount: amt, period: period || monthLabel, method: method || 'Manual',
      reference: reference || null, created_at: new Date().toISOString() }
    d.sub_payments = d.sub_payments || []
    d.sub_payments.push(row); save(d)
    return clone(row)
  },
  async adminSubscriptions() {
    await delay(60); const d = db()
    const name = (m) => `${m?.first_name || ''} ${m?.last_name || ''}`.trim() || '—'
    const owners = d.managers.filter((m) => m.role === 'owner' && !m.platform_admin)
    const payments = (d.sub_payments || []).slice().sort(byCreatedDesc)
      .map((p) => { const o = owners.find((x) => x.id === p.manager_id); return { ...clone(p), workspace: name(o), company: o?.brand_name || name(o) } })
    return {
      total: payments.reduce((s, x) => s + Number(x.amount), 0),
      mrr: owners.filter((o) => o.plan_active).reduce((s, o) => s + (Number(o.plan_price) || 0), 0),
      count: payments.length, payments,
    }
  },
  // All rent transactions + the 0.5% fee they generated (admin).
  async adminTransactions() {
    await delay(60); const d = db()
    const name = (m) => `${m?.first_name || ''} ${m?.last_name || ''}`.trim() || '—'
    const tname = (t) => `${t?.first_name || ''} ${t?.last_name || ''}`.trim() || '—'
    const owners = d.managers.filter((m) => m.role === 'owner' && !m.platform_admin)
    const approved = (d.payments || []).filter((p) => p.status === 'approved').slice().sort(byCreatedDesc)
    const company = (o) => o?.brand_name || name(o)
    const payments = approved.map((p) => { const o = owners.find((x) => x.id === p.manager_id); return {
      id: p.id, manager_id: p.manager_id, created_at: p.approved_at || p.paid_date || p.created_at,
      amount: Number(p.amount), fee: p.fee != null ? Number(p.fee) : platformFee(p.amount), method: p.method,
      workspace: company(o), manager: name(o), tenant: tname(d.tenants.find((t) => t.id === p.tenant_id)),
    } })
    const byWorkspace = owners.map((m) => {
      const ws = approved.filter((p) => p.manager_id === m.id)
      const volume = ws.reduce((s, p) => s + Number(p.amount), 0)
      return { id: m.id, name: company(m), manager: name(m), volume, fees: platformFee(volume), count: ws.length }
    }).filter((w) => w.count > 0).sort((a, b) => b.fees - a.fees)
    return {
      totalVolume: payments.reduce((s, r) => s + r.amount, 0),
      totalFees: payments.reduce((s, r) => s + r.fee, 0),
      count: payments.length, byWorkspace, payments,
    }
  },

  // ── tenant AI questions (manager inbox) ───────────────────────────────────
  async logTenantQuestion(managerId, tenantId, { question, answer }) {
    await delay(40); const d = db()
    d.questions = d.questions || []
    d.questions.push({ id: uid(), manager_id: managerId, tenant_id: tenantId, question, answer, read_by_manager: false, created_at: new Date().toISOString() })
    save(d)
  },
  async listTenantQuestions(managerId) {
    await delay(40); const d = db()
    return (d.questions || []).filter((x) => x.manager_id === managerId).sort(byCreatedDesc).map(clone)
  },
  async tenantQuestionsUnread(managerId) {
    const d = db()
    return (d.questions || []).filter((x) => x.manager_id === managerId && !x.read_by_manager).length
  },
  async markTenantQuestionsRead(managerId) {
    const d = db()
    let touched = false
    ;(d.questions || []).forEach((x) => { if (x.manager_id === managerId && !x.read_by_manager) { x.read_by_manager = true; touched = true } })
    if (touched) save(d)
  },

  // ── tenant ↔ manager messages ──────────────────────────────────────────
  async listMessages(userId, tenantId) {
    await delay(30); const d = db()
    const id = tenantId || userId
    return (d.messages || []).filter((m) => m.tenant_id === id)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map(clone)
  },
  async listMessageThreads(userId) {
    await delay(30); const d = db(); const { ownerId } = scopeOf(d, userId)
    const rows = (d.messages || []).filter((m) => m.manager_id === ownerId).sort(byCreatedDesc)
    const byTenant = new Map()
    for (const m of rows) {
      let t = byTenant.get(m.tenant_id)
      if (!t) { t = { tenant_id: m.tenant_id, last: clone(m), unread: 0 }; byTenant.set(m.tenant_id, t) }
      if (m.sender_role === 'tenant' && !m.read_by_manager) t.unread += 1
    }
    return [...byTenant.values()]
  },
  async messagesUnread(userId) {
    const d = db()
    if (d.tenants.some((t) => t.id === userId)) {
      return (d.messages || []).filter((m) => m.tenant_id === userId && m.sender_role === 'manager' && !m.read_by_tenant).length
    }
    const { ownerId } = scopeOf(d, userId)
    return (d.messages || []).filter((m) => m.manager_id === ownerId && m.sender_role === 'tenant' && !m.read_by_manager).length
  },
  async sendMessage(userId, { tenantId, body, fromAssistant }) {
    await delay(40); const d = db()
    d.messages = d.messages || []
    const asTenant = d.tenants.find((t) => t.id === userId)
    const m = asTenant
      ? { id: uid(), manager_id: asTenant.manager_id, tenant_id: userId, sender_role: 'tenant', sender_id: userId, body, from_assistant: !!fromAssistant, read_by_tenant: true, read_by_manager: false, created_at: new Date().toISOString() }
      : { id: uid(), manager_id: scopeOf(d, userId).ownerId, tenant_id: tenantId, sender_role: 'manager', sender_id: userId, body, from_assistant: false, read_by_tenant: false, read_by_manager: true, created_at: new Date().toISOString() }
    d.messages.push(m); save(d); return clone(m)
  },
  async markMessagesRead(userId, tenantId) {
    const d = db()
    d.messages = d.messages || []
    const asTenant = d.tenants.some((t) => t.id === userId)
    const id = tenantId || userId
    let touched = false
    d.messages.forEach((m) => {
      if (m.tenant_id !== id) return
      // Only ever mark the OTHER side's messages as read.
      if (asTenant && m.sender_role === 'manager' && !m.read_by_tenant) { m.read_by_tenant = true; touched = true }
      if (!asTenant && m.sender_role === 'tenant' && !m.read_by_manager) { m.read_by_manager = true; touched = true }
    })
    if (touched) save(d)
  },

  // ── properties ────────────────────────────────────────────────────────────
  async listProperties(userId) {
    await delay(60)
    const d = db(); const { ownerId, isStaff, propIds } = scopeOf(d, userId)
    return d.properties.filter((p) => p.manager_id === ownerId && (!isStaff || propIds.has(p.id))).map(clone)
  },
  async createProperty(userId, data) {
    await delay(); const d = db(); const { ownerId, isStaff, m } = scopeOf(d, userId)
    const p = { id: uid(), manager_id: ownerId, created_at: new Date().toISOString(), ...data }
    d.properties.push(p)
    // A staff member who adds a property keeps access to it.
    if (isStaff) m.assigned_property_ids = [...(m.assigned_property_ids || []), p.id]
    save(d); return clone(p)
  },
  async updateProperty(id, patch) {
    await delay(); const d = db()
    const p = d.properties.find((x) => x.id === id); Object.assign(p, patch); save(d); return clone(p)
  },
  async deleteProperty(id) {
    await delay(); const d = db()
    d.properties = d.properties.filter((x) => x.id !== id)
    d.tenants.forEach((t) => { if (t.property_id === id) t.property_id = null })
    save(d)
  },

  // ── expenses ──────────────────────────────────────────────────────────────
  async listExpenses(userId) {
    await delay(40)
    const d = db(); const { ownerId, isStaff, propIds } = scopeOf(d, userId)
    return (d.expenses || [])
      .filter((e) => e.manager_id === ownerId && (!isStaff || (e.property_id && propIds.has(e.property_id))))
      .sort(byCreatedDesc).map(clone)
  },
  async createExpense(userId, data) {
    await delay(); const d = db(); const { ownerId } = scopeOf(d, userId)
    d.expenses = d.expenses || []
    const e = {
      id: uid(), manager_id: ownerId, property_id: data.property_id || null,
      category: data.category, amount: Number(data.amount) || 0,
      spent_on: data.spent_on || new Date().toISOString().slice(0, 10),
      note: data.note || '', created_at: new Date().toISOString(),
    }
    d.expenses.push(e); save(d); return clone(e)
  },
  async deleteExpense(id) {
    await delay(); const d = db()
    d.expenses = (d.expenses || []).filter((e) => e.id !== id); save(d)
  },

  // ── maintenance / repair requests ───────────────────────────────────────────
  async listMaintenance(userId) {
    await delay(50); const d = db(); const { ownerId, isStaff, propIds } = scopeOf(d, userId)
    return (d.maintenance || [])
      .filter((m) => m.manager_id === ownerId && (!isStaff || (m.property_id && propIds.has(m.property_id))))
      .sort(byCreatedDesc).map(clone)
  },
  async listTenantMaintenance(tenantId) {
    await delay(50); const d = db()
    return (d.maintenance || []).filter((m) => m.tenant_id === tenantId).sort(byCreatedDesc).map(clone)
  },
  async getMaintenance(id) {
    await delay(30); const m = (db().maintenance || []).find((x) => x.id === id); return m ? clone(m) : null
  },
  async createMaintenanceRequest(tenantId, data) {
    await delay(); const d = db(); const t = d.tenants.find((x) => x.id === tenantId)
    d.maintenance = d.maintenance || []
    const m = {
      id: uid(), manager_id: t.manager_id, tenant_id: tenantId, property_id: t.property_id || null, unit: t.unit || '',
      title: data.title, category: data.category || 'General', description: data.description || '',
      photo_url: data.photo_url || null, priority: data.priority || 'normal',
      status: 'open', cost: 0, manager_note: '', caretaker_name: '',
      expense_logged: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), resolved_at: null,
    }
    d.maintenance.push(m); save(d); return clone(m)
  },
  async updateMaintenance(id, patch) {
    await delay(); const d = db(); const m = (d.maintenance || []).find((x) => x.id === id)
    if (!m) throw new Error('Request not found.')
    const allowed = ['status', 'manager_note', 'caretaker_name', 'cost', 'priority', 'category', 'title', 'description']
    allowed.forEach((k) => { if (k in patch) m[k] = patch[k] })
    if ('cost' in patch) m.cost = Number(patch.cost) || 0
    if (patch.status === 'resolved' && !m.resolved_at) m.resolved_at = new Date().toISOString()
    if (patch.status && patch.status !== 'resolved') m.resolved_at = null
    // Log the repair cost as a property expense once, when it's resolved — with
    // the full detail (what, category, unit, tenant, who fixed it) so it reads
    // clearly in Finances and traces back to this request.
    if (m.status === 'resolved' && m.cost > 0 && !m.expense_logged) {
      const t = d.tenants.find((x) => x.id === m.tenant_id)
      const bits = [m.category, m.unit ? `Unit ${m.unit}` : null, t ? `${t.first_name} ${t.last_name}`.trim() : null].filter(Boolean).join(', ')
      const note = `Repair: ${m.title}${bits ? ` (${bits})` : ''}${m.caretaker_name ? ` · by ${m.caretaker_name}` : ''}`
      d.expenses = d.expenses || []
      d.expenses.push({
        id: uid(), manager_id: m.manager_id, property_id: m.property_id || null,
        category: 'Maintenance', amount: m.cost,
        spent_on: new Date().toISOString().slice(0, 10), note,
        maintenance_id: m.id, created_at: new Date().toISOString(),
      })
      m.expense_logged = true
    }
    m.updated_at = new Date().toISOString()
    save(d); return clone(m)
  },
  async maintenanceOpenCount(userId) {
    await delay(20); const d = db(); const { ownerId, isStaff, propIds } = scopeOf(d, userId)
    return (d.maintenance || []).filter((m) => m.manager_id === ownerId && m.status !== 'resolved' && (!isStaff || (m.property_id && propIds.has(m.property_id)))).length
  },

  // ── tenants ───────────────────────────────────────────────────────────────
  async listTenants(userId) {
    await delay(60)
    const d = db(); const { ownerId, isStaff, propIds } = scopeOf(d, userId)
    return d.tenants
      .filter((t) => t.manager_id === ownerId && (!isStaff || (t.property_id && propIds.has(t.property_id))))
      .map(stripSecret)
  },
  async getTenant(id) {
    await delay(40); const d = db(); const t = d.tenants.find((x) => x.id === id)
    return t && canSeeTenant(d, t) ? stripSecret(t) : null
  },

  async createTenant(userId, data) {
    await delay(); const d = db(); const { ownerId } = scopeOf(d, userId)
    // A tenant's email is their login and is GLOBALLY unique (mirrors the
    // production unique index on tenants.email). This guarantees that signing in
    // by email resolves to exactly one tenant — and therefore one manager — so a
    // tenant can never be routed to the wrong workspace.
    const email = (data.email || '').toLowerCase().trim()
    if (email && d.tenants.some((x) => x.email === email)) {
      throw new Error('A tenant with this email already exists.')
    }
    // Enforce the OWNER's plan capacity (or free allowance) across the workspace.
    const mgr = d.managers.find((x) => x.id === ownerId)
    const count = d.tenants.filter((x) => x.manager_id === ownerId).length
    const cap = capacityFor(mgr)
    if (count >= cap) {
      const msg = mgr?.plan_active
        ? `You've reached your plan limit of ${cap} tenants. Upgrade your plan to add more.`
        : `You need an active plan to add tenants. Subscribe and pay an installment to continue.`
      throw new Error(msg)
    }
    const tempPassword = genTempPassword()
    const t = {
      id: uid(), manager_id: ownerId,
      property_id: data.property_id || null,
      first_name: data.first_name, last_name: data.last_name,
      email, phone: data.phone || '',
      unit: data.unit || '', rent: Number(data.rent) || 0,
      due_day: Number(data.due_day) || 1, lease_start: data.lease_start || null,
      lease_end: data.lease_end || null, lease_doc: data.lease_doc || null, lease_doc_name: data.lease_doc_name || null,
      status: 'pending', account_status: 'pending_verification',
      total_paid: 0, credit_balance: 0,
      first_login: true, email_verified: false, phone_verified: false,
      temp_password: tempPassword, password: null,
      created_at: new Date().toISOString(),
    }
    d.tenants.push(t); save(d)
    return { tenant: stripSecret(t), tempPassword }
  },

  async updateTenant(id, patch) {
    await delay(); const d = db()
    const t = d.tenants.find((x) => x.id === id)
    if (!canSeeTenant(d, t)) throw new Error('Not found in your workspace.')
    const allowed = ['property_id', 'first_name', 'last_name', 'email', 'phone', 'unit',
      'rent', 'due_day', 'lease_start', 'lease_end', 'lease_doc', 'lease_doc_name',
      'status', 'credit_balance', 'account_status', 'avatar']
    allowed.forEach((k) => { if (k in patch) t[k] = patch[k] })
    if ('rent' in patch) t.rent = Number(patch.rent) || 0
    if ('credit_balance' in patch) t.credit_balance = Number(patch.credit_balance) || 0
    save(d); return stripSecret(t)
  },

  async resendCredentials(tenantId) {
    await delay(); const d = db()
    const t = d.tenants.find((x) => x.id === tenantId)
    if (!canSeeTenant(d, t)) throw new Error('Not found in your workspace.')
    const tempPassword = genTempPassword()
    t.temp_password = tempPassword
    t.password = null
    t.first_login = true
    // Verification + account_status deliberately preserved — see db.js.
    save(d)
    return { tempPassword }
  },

  // ── payments ──────────────────────────────────────────────────────────────
  async listPayments(userId, { status } = {}) {
    await delay(60)
    const d = db(); const { ownerId, isStaff, propIds } = scopeOf(d, userId)
    let rows = d.payments.filter((p) => p.manager_id === ownerId)
    if (isStaff) {
      const tById = new Map(d.tenants.map((t) => [t.id, t]))
      rows = rows.filter((p) => { const t = tById.get(p.tenant_id); return t && t.property_id && propIds.has(t.property_id) })
    }
    if (status) rows = rows.filter((p) => p.status === status)
    return rows.sort(byCreatedDesc).map(clone)
  },
  async listTenantPayments(tenantId) {
    await delay(60)
    return db().payments.filter((p) => p.tenant_id === tenantId).sort(byCreatedDesc).map(clone)
  },

  async submitPayment(tenantId, data) {
    await delay(); const d = db()
    const t = d.tenants.find((x) => x.id === tenantId)
    const p = {
      id: uid(), tenant_id: tenantId, manager_id: t.manager_id,
      amount: Number(data.amount), fee: Number(data.fee) || 0, method: data.method, reference: data.reference || '',
      paid_date: data.paid_date || new Date().toISOString().slice(0, 10),
      period_from: data.period_from, period_to: data.period_to,
      status: 'pending', is_advance: false, credit_amount: 0,
      receipt_no: null, rejected_reason: null,
      payer_phone: data.payer_phone || null, proof_url: data.proof_url || null, paid_online: false,
      created_at: new Date().toISOString(), approved_at: null,
    }
    d.payments.push(p)
    if (t.status === 'pending' || t.status === 'due' || t.status === 'overdue') t.status = 'pending'
    save(d); return clone(p)
  },

  // Online payments (card / EcoCash express) are confirmed by the gateway, so
  // they are recorded already approved with a receipt — no manager review.
  async submitOnlinePayment(tenantId, data) {
    await delay(); const d = db()
    const t = d.tenants.find((x) => x.id === tenantId)
    const { newCredit, isAdvance, coversCurrent } = applyPayment({
      rent: t.rent, creditBalance: t.credit_balance, amount: Number(data.amount),
    })
    const p = {
      id: uid(), tenant_id: tenantId, manager_id: t.manager_id,
      amount: Number(data.amount), fee: Number(data.fee) || 0, method: data.method, reference: data.reference || '',
      paid_date: data.paid_date || new Date().toISOString().slice(0, 10),
      period_from: data.period_from, period_to: data.period_to,
      status: 'approved', is_advance: isAdvance, credit_amount: newCredit,
      receipt_no: nextReceiptNo(d), rejected_reason: null,
      payer_phone: data.payer_phone || null, proof_url: null, paid_online: true,
      created_at: new Date().toISOString(), approved_at: new Date().toISOString(),
    }
    d.payments.push(p)
    t.total_paid = Number(t.total_paid) + Number(p.amount)
    t.credit_balance = newCredit
    t.status = coversCurrent ? 'paid' : 'due'
    save(d); return clone(p)
  },

  async approvePayment(paymentId) {
    await delay(); const d = db()
    const p = d.payments.find((x) => x.id === paymentId)
    const t = d.tenants.find((x) => x.id === p.tenant_id)
    const { newCredit, isAdvance, coversCurrent } = applyPayment({
      rent: t.rent, creditBalance: t.credit_balance, amount: p.amount,
    })
    p.status = 'approved'
    p.receipt_no = nextReceiptNo(d)
    p.is_advance = isAdvance
    p.credit_amount = newCredit
    p.approved_at = new Date().toISOString()
    t.total_paid = Number(t.total_paid) + Number(p.amount)
    t.credit_balance = newCredit
    t.status = coversCurrent ? 'paid' : 'due'
    save(d)
    return clone(p)
  },

  // Manager records a payment on the tenant's behalf (e.g. cash). Auto-approved
  // with a receipt; applied to the period the caller specifies (usually the
  // oldest unpaid one).
  async recordCashPayment(tenantId, data) {
    await delay(); const d = db()
    const t = d.tenants.find((x) => x.id === tenantId)
    const amount = Number(data.amount) || 0
    const { newCredit, isAdvance } = applyPayment({ rent: t.rent, creditBalance: t.credit_balance, amount })
    const p = {
      id: uid(), tenant_id: tenantId, manager_id: t.manager_id,
      amount, method: data.method || 'Cash USD', reference: data.reference || '',
      paid_date: data.paid_date || new Date().toISOString().slice(0, 10),
      period_from: data.period_from, period_to: data.period_to,
      status: 'approved', is_advance: isAdvance, credit_amount: newCredit,
      receipt_no: nextReceiptNo(d), rejected_reason: null,
      payer_phone: null, proof_url: null, paid_online: false, recorded_by: 'manager',
      created_at: new Date().toISOString(), approved_at: new Date().toISOString(),
    }
    d.payments.push(p)
    t.total_paid = Number(t.total_paid) + amount
    t.credit_balance = newCredit
    const arr = computeArrears(t, d.payments)
    t.status = arr.total > 0 ? (arr.broughtForward > 0 ? 'overdue' : 'due') : 'paid'
    save(d); return clone(p)
  },

  async rejectPayment(paymentId, reason) {
    await delay(); const d = db()
    const p = d.payments.find((x) => x.id === paymentId)
    p.status = 'rejected'; p.rejected_reason = reason || ''
    const t = d.tenants.find((x) => x.id === p.tenant_id)
    const stillPending = d.payments.some((x) => x.tenant_id === t.id && x.status === 'pending')
    if (!stillPending && t.status === 'pending') t.status = 'due'
    save(d); return clone(p)
  },

  // ── notifications ─────────────────────────────────────────────────────────
  async listNotifications(userId) {
    await delay(60)
    const d = db(); const { ownerId, isStaff, propIds } = scopeOf(d, userId)
    return d.notifications
      .filter((n) => n.manager_id === ownerId && (!isStaff
        || n.recipient_scope === 'all'
        || (n.property_id && propIds.has(n.property_id))
        || (n.tenant_id && propIds.has((d.tenants.find((t) => t.id === n.tenant_id) || {}).property_id))))
      .sort(byCreatedDesc).map(clone)
  },
  async createNotification(userId, data) {
    await delay(); const d = db(); const { ownerId } = scopeOf(d, userId)
    const n = {
      id: uid(), manager_id: ownerId,
      recipient_scope: data.recipient_scope,
      property_id: data.property_id || null,
      tenant_id: data.tenant_id || null,
      subject: data.subject, message: data.message,
      priority: data.priority || 'normal',
      created_at: new Date().toISOString(),
    }
    d.notifications.push(n); save(d); return clone(n)
  },
  // For a notification, how many of the addressed tenants have read it.
  async notificationStats(notificationId) {
    await delay(30); const d = db()
    const n = d.notifications.find((x) => x.id === notificationId)
    const recipients = tenantsForNotification(d, n)
    const reads = d.reads.filter((r) => r.notification_id === notificationId).length
    return { read: reads, total: recipients.length }
  },

  async listTenantNotifications(tenantId) {
    await delay(60); const d = db()
    const t = d.tenants.find((x) => x.id === tenantId)
    const items = d.notifications.filter((n) => addressedToTenant(n, t)).sort(byCreatedDesc)
    return items.map((n) => ({
      ...clone(n),
      read: d.reads.some((r) => r.notification_id === n.id && r.tenant_id === tenantId),
    }))
  },
  async unreadCount(tenantId) {
    const d = db()
    const t = d.tenants.find((x) => x.id === tenantId)
    if (!t) return 0
    return d.notifications.filter((n) =>
      addressedToTenant(n, t) && !d.reads.some((r) => r.notification_id === n.id && r.tenant_id === tenantId)
    ).length
  },
  async markNotificationRead(notificationId, tenantId) {
    const d = db()
    if (!d.reads.some((r) => r.notification_id === notificationId && r.tenant_id === tenantId)) {
      d.reads.push({ notification_id: notificationId, tenant_id: tenantId, read_at: new Date().toISOString() })
      save(d)
    }
  },
}

// ── helpers ─────────────────────────────────────────────────────────────────
function stripSecret(t) { const c = clone(t); delete c.password; delete c.temp_password; return c }
function byCreatedDesc(a, b) { return new Date(b.created_at) - new Date(a.created_at) }
function nextReceiptNo(d) {
  d.receipt_seq = (d.receipt_seq || 1000) + 1
  const yymm = new Date().toISOString().slice(2, 7).replace('-', '')
  return `RF-${yymm}-${String(d.receipt_seq).padStart(5, '0')}`
}
function addressedToTenant(n, t) {
  if (!t || n.manager_id !== t.manager_id) return false
  if (n.recipient_scope === 'all') return true
  if (n.recipient_scope === 'property') return n.property_id === t.property_id
  if (n.recipient_scope === 'individual') return n.tenant_id === t.id
  return false
}
function tenantsForNotification(d, n) {
  return d.tenants.filter((t) => addressedToTenant(n, t))
}

// ═══════════════════════════════════════════════════════════════════════════
//  Seed data — a ready-to-explore demo workspace
// ═══════════════════════════════════════════════════════════════════════════
function seed() {
  const today = new Date()
  const isoDay = (d) => new Date(d).toISOString().slice(0, 10)
  // n months ago, clamping the day so short months (e.g. Feb) don't overflow
  // into the next month — otherwise seeded payment periods skip/duplicate months.
  const monthsAgo = (n) => {
    const y = today.getFullYear(), m = today.getMonth() - n
    const lastDay = new Date(y, m + 1, 0).getDate()
    return new Date(y, m, Math.min(today.getDate(), lastDay))
  }

  const managerId = 'mgr-demo-0001'
  const manager = {
    id: managerId, role: 'owner', owner_id: null, account_status: 'active',
    first_name: 'Tendai', last_name: 'Moyo',
    email: 'demo@rentflow.app', phone: '0772000111', password: 'demo1234',
    country: 'ZW', currency: 'USD', currencies: ['USD'],
    late_fee_enabled: false, late_fee_type: 'flat', late_fee_amount: 0, late_fee_grace_days: 3,
    accepted_methods: null, // null = all methods enabled
    payment_details: {
      'Bank Transfer': 'CBZ Bank\nAccount name: Tendai Moyo Properties\nAccount no: 0123 4567 8901\nBranch: Avondale (code 1234)',
      'InnBucks': 'InnBucks MasterWallet\nName: Tendai Moyo\nNumber: 0772 000 111',
      'Mukuru': 'Send to Mukuru pay-in number 0772 000 111 (Tendai Moyo). Use your unit number as the reference.',
      'Cash USD': 'Pay at the office: 12 Smith Road, Avondale, Harare. Mon–Fri, 9am–4pm. Ask for Tendai and collect your receipt.',
    },
    notify_on_tenant_ai: false,
    reminders_enabled: true, reminder_channel: 'whatsapp', reminder_rules: null, refunds_enabled: true,
    plan_capacity: 20, plan_price: 80, plan_active: true, plan_started_at: monthsAgo(2).toISOString(),
    onboarded: true, billing_card: { brand: 'Visa', last4: '4242', exp: '08/30', name: 'Tendai Moyo' },
    brand_name: null, brand_logo: null, brand_color: null,
    created_at: monthsAgo(8).toISOString(),
  }

  // Two staff managers, each assigned to one building. They sign in with the
  // normal Manager login and see only their assigned property's data.
  const mkStaff = (o) => ({
    role: 'staff', owner_id: managerId, account_status: 'active', must_change: false, country: 'ZW', currency: 'USD', currencies: ['USD'],
    accepted_methods: null, payment_details: {}, notify_on_tenant_ai: false,
    ai_enabled_self: true, ai_enabled_tenants: true,
    plan_capacity: null, plan_price: null, plan_active: false, onboarded: true,
    created_at: monthsAgo(3).toISOString(), ...o,
  })
  const staff = [
    mkStaff({ id: 'mgr-staff-0001', first_name: 'Rumbidzai', last_name: 'Chari', email: 'agent1@rentflow.app', phone: '0772555001', password: 'agent1234', assigned_property_ids: ['prop-0001'] }),
    mkStaff({ id: 'mgr-staff-0002', first_name: 'Tatenda', last_name: 'Mhute', email: 'agent2@rentflow.app', phone: '0772555002', password: 'agent1234', assigned_property_ids: ['prop-0002'] }),
  ]

  const prop1 = {
    id: 'prop-0001', manager_id: managerId, name: 'Avondale Heights', location: 'Avondale, Harare', units: 6, type: 'Apartment block',
    photos: [], address: '12 King George Road', suburb: 'Avondale', city: 'Harare', province: 'Harare',
    map_link: 'https://maps.google.com/?q=-17.8002,31.0335',
    bedrooms: 2, bathrooms: 1, lounges: 1, floor_size: 75, stand_size: null, furnished: 'Unfurnished', year_built: 2014, storeys: 3,
    amenities: ['municipal_water', 'water_tank', 'zesa_prepaid', 'wifi', 'durawall', 'auto_gate', 'cctv', 'guard', 'parking', 'bic', 'tiled'],
    deposit: 350, available_from: null, utilities_included: ['Water', 'Refuse'], max_occupants: 4, levy_fee: 25,
    description: 'Secure apartment block in leafy Avondale, walking distance to shops and transport.', rules: 'No loud music after 10pm. No subletting.',
    caretaker_name: 'Joseph M.', caretaker_phone: '0772333444', is_advertised: false,
    created_at: monthsAgo(8).toISOString(),
  }
  const prop2 = {
    id: 'prop-0002', manager_id: managerId, name: 'Borrowdale Villas', location: 'Borrowdale, Harare', units: 4, type: 'Townhouse',
    photos: [], address: '8 Whitwell Road', suburb: 'Borrowdale', city: 'Harare', province: 'Harare',
    map_link: 'https://maps.google.com/?q=-17.7378,31.0857',
    bedrooms: 3, bathrooms: 2.5, lounges: 2, floor_size: 180, stand_size: 600, furnished: 'Part-furnished', year_built: 2019, storeys: 2,
    amenities: ['borehole', 'water_tank', 'solar', 'inverter', 'zesa_prepaid', 'wifi', 'geyser', 'durawall', 'electric_fence', 'auto_gate', 'cctv', 'parking', 'pool', 'garden', 'aircon', 'balcony', 'bic', 'cottage', 'pets'],
    deposit: 600, available_from: isoDay(monthsAgo(-1)), utilities_included: ['WiFi'], max_occupants: 6, levy_fee: 80,
    description: 'Modern townhouse with solar backup, borehole and a private garden in upmarket Borrowdale.', rules: 'Pets allowed with deposit. No commercial use.',
    caretaker_name: 'Grace T.', caretaker_phone: '0775888999', is_advertised: true,
    created_at: monthsAgo(6).toISOString(),
  }

  const mkTenant = (o) => ({
    manager_id: managerId, account_status: 'active', total_paid: 0, credit_balance: 0,
    first_login: false, email_verified: true, phone_verified: true, lease_start: isoDay(monthsAgo(5)),
    lease_end: isoDay(new Date(today.getFullYear(), today.getMonth() + 7, 1)), lease_doc: null, lease_doc_name: null,
    temp_password: null, password: 'tenant123', created_at: monthsAgo(5).toISOString(), ...o,
  })

  const tenants = [
    mkTenant({ id: 'ten-0001', property_id: 'prop-0001', first_name: 'Rudo', last_name: 'Chikore', email: 'rudo@example.com', phone: '0775123001', unit: 'A1', rent: 350, due_day: 1, status: 'paid', total_paid: 2550, credit_balance: 800 }),
    mkTenant({ id: 'ten-0002', property_id: 'prop-0001', first_name: 'Farai', last_name: 'Ncube', email: 'farai@example.com', phone: '0775123002', unit: 'A2', rent: 350, due_day: 1, status: 'due', total_paid: 1400 }),
    mkTenant({ id: 'ten-0003', property_id: 'prop-0002', first_name: 'Chipo', last_name: 'Dube', email: 'chipo@example.com', phone: '0775123003', unit: 'V3', rent: 600, due_day: 5, status: 'paid', total_paid: 3050, credit_balance: 250 }),
    // First-login tenant to demo the verification flow. Temp password shown in console / login hint.
    mkTenant({ id: 'ten-0004', property_id: 'prop-0002', first_name: 'Tafadzwa', last_name: 'Sibanda', email: 'tafadzwa@example.com', phone: '0775123004', unit: 'V1', rent: 600, due_day: 5, status: 'pending', total_paid: 0, first_login: true, email_verified: false, phone_verified: false, account_status: 'pending_verification', password: null, temp_password: 'TEMP-7K2P' }),
  ]

  const payments = []
  const pushPaid = (tenant, monthBack, extra = {}) => {
    const period = periodForDate(monthsAgo(monthBack), tenant.due_day)
    payments.push({
      id: uid(), tenant_id: tenant.id, manager_id: managerId, amount: tenant.rent,
      method: 'EcoCash', reference: 'EC' + Math.floor(Math.random() * 1e6),
      paid_date: isoDay(monthsAgo(monthBack)), period_from: period.from, period_to: period.to,
      status: 'approved', is_advance: false, credit_amount: 0,
      receipt_no: 'RF-2600-' + String(1000 + payments.length + 1).padStart(5, '0'),
      rejected_reason: null, created_at: monthsAgo(monthBack).toISOString(),
      approved_at: monthsAgo(monthBack).toISOString(), ...extra,
    })
  }
  // History for Rudo (5 months paid) and Chipo (5 months + advance), Farai 4 months
  for (let m = 5; m >= 1; m--) pushPaid(tenants[0], m)
  for (let m = 5; m >= 2; m--) pushPaid(tenants[1], m)
  for (let m = 5; m >= 1; m--) pushPaid(tenants[2], m)
  // Chipo paid extra last month -> $250 credit
  pushPaid(tenants[2], 0, { amount: 850, is_advance: true, credit_amount: 250, method: 'Bank Transfer' })

  // A couple of pending submissions for the approvals queue
  const farPeriod = periodForDate(monthsAgo(1), tenants[1].due_day)
  payments.push({
    id: uid(), tenant_id: tenants[1].id, manager_id: managerId, amount: 350,
    method: 'InnBucks', reference: 'INB554210', paid_date: isoDay(today),
    period_from: farPeriod.from, period_to: farPeriod.to, status: 'pending',
    is_advance: false, credit_amount: 0, receipt_no: null, rejected_reason: null,
    created_at: new Date(today.getTime() - 3600e3).toISOString(), approved_at: null,
  })
  tenants[1].status = 'pending'

  const notifications = [
    { id: 'ntf-0001', manager_id: managerId, recipient_scope: 'all', property_id: null, tenant_id: null,
      subject: 'Water interruption Saturday', message: 'The city has scheduled water maintenance this Saturday 8am–2pm. Please store water in advance.', priority: 'urgent', created_at: monthsAgo(0.2).toISOString() },
    { id: 'ntf-0002', manager_id: managerId, recipient_scope: 'property', property_id: 'prop-0001', tenant_id: null,
      subject: 'Avondale gate remote', message: 'New gate remotes are ready for collection at the office.', priority: 'info', created_at: monthsAgo(0.5).toISOString() },
  ]

  const reads = [
    { notification_id: 'ntf-0001', tenant_id: 'ten-0001', read_at: today.toISOString() },
  ]

  const expenses = [
    { id: uid(), manager_id: managerId, property_id: 'prop-0001', category: 'Maintenance', amount: 180, spent_on: isoDay(monthsAgo(1)), note: 'Plumbing repair, Unit A2', created_at: monthsAgo(1).toISOString() },
    { id: uid(), manager_id: managerId, property_id: 'prop-0001', category: 'Utilities', amount: 95, spent_on: isoDay(monthsAgo(2)), note: 'Common-area water', created_at: monthsAgo(2).toISOString() },
    { id: uid(), manager_id: managerId, property_id: 'prop-0002', category: 'Rates', amount: 120, spent_on: isoDay(monthsAgo(0)), note: 'City council rates', created_at: monthsAgo(0).toISOString() },
    { id: uid(), manager_id: managerId, property_id: null, category: 'Other', amount: 45, spent_on: isoDay(monthsAgo(3)), note: 'New gate remotes', created_at: monthsAgo(3).toISOString() },
  ]

  const periodLabel = (d) => d.toLocaleString('en-US', { month: 'long', year: 'numeric' })
  const sub_payments = [
    { id: uid(), manager_id: managerId, amount: 80, period: periodLabel(monthsAgo(2)), method: 'Visa ····4242', reference: 'CARD-7K2P9X', created_at: monthsAgo(2).toISOString() },
    { id: uid(), manager_id: managerId, amount: 80, period: periodLabel(monthsAgo(1)), method: 'Visa ····4242', reference: 'CARD-M4QB2T', created_at: monthsAgo(1).toISOString() },
  ]

  // ── Platform owner (RentLoja super-admin) + other subscribing workspaces ────
  // These give the admin overview real subscriptions & revenue. They are
  // separate accounts and never appear inside Tendai's property-manager views.
  const admin = {
    id: 'mgr-admin', role: 'owner', owner_id: null, platform_admin: true, account_status: 'active',
    first_name: 'RentLoja', last_name: 'HQ', email: 'admin@rentflow.app', phone: '0780000000', password: 'admin1234',
    country: 'ZW', currency: 'USD', currencies: ['USD'], onboarded: true,
    plan_active: false, plan_capacity: null, plan_price: null, accepted_methods: null, payment_details: {},
    created_at: monthsAgo(12).toISOString(),
  }
  const mkOwner = (o) => ({
    role: 'owner', owner_id: null, account_status: 'active', onboarded: true,
    country: 'ZW', currency: 'USD', currencies: ['USD'], accepted_methods: null, payment_details: {},
    reminders_enabled: true, reminder_channel: 'whatsapp', ai_enabled_self: true, ai_enabled_tenants: true,
    late_fee_enabled: false, late_fee_type: 'flat', late_fee_amount: 0, late_fee_grace_days: 3, ...o,
  })
  const extraOwners = [
    mkOwner({ id: 'mgr-ws2', first_name: 'Nyasha', last_name: 'Marufu', brand_name: 'Blue Roof Homes', email: 'nyasha@blueroofhomes.co.zw', phone: '0772200200', password: 'demo1234', plan_active: true, plan_capacity: 50, plan_price: 280, plan_started_at: monthsAgo(5).toISOString(), created_at: monthsAgo(5).toISOString() }),
    mkOwner({ id: 'mgr-ws3', first_name: 'Tatenda', last_name: 'Hove', brand_name: 'Hove Lettings', email: 'tatenda@hovelets.co.zw', phone: '0773300300', password: 'demo1234', plan_active: true, plan_capacity: 5, plan_price: 14, plan_started_at: monthsAgo(3).toISOString(), created_at: monthsAgo(3).toISOString() }),
    mkOwner({ id: 'mgr-ws4', first_name: 'Chiedza', last_name: 'Banda', brand_name: 'Harare Living', email: 'chiedza@harareliving.co.zw', phone: '0774400400', password: 'demo1234', plan_active: true, plan_capacity: 100, plan_price: 580, plan_started_at: monthsAgo(7).toISOString(), created_at: monthsAgo(7).toISOString() }),
    mkOwner({ id: 'mgr-ws5', first_name: 'Brian', last_name: 'Dube', brand_name: 'Dube Properties', email: 'brian@dubeproperties.co.zw', phone: '0775500500', password: 'demo1234', plan_active: false, plan_capacity: 20, plan_price: 80, plan_started_at: monthsAgo(6).toISOString(), created_at: monthsAgo(6).toISOString() }),
  ]
  const addSubs = (id, price, months) => {
    for (let i = months; i >= 1; i--) {
      sub_payments.push({ id: uid(), manager_id: id, amount: price, period: periodLabel(monthsAgo(i)),
        method: 'Visa ····' + (1000 + Math.floor(Math.random() * 8999)),
        reference: 'CARD-' + Math.random().toString(36).slice(2, 8).toUpperCase(), created_at: monthsAgo(i).toISOString() })
    }
  }
  addSubs('mgr-ws2', 280, 5)
  addSubs('mgr-ws3', 14, 3)
  addSubs('mgr-ws4', 580, 7)
  addSubs('mgr-ws5', 80, 1) // churned after the first month

  // Give the other companies real rent activity so the platform sees the 0.5%
  // transaction fee they generate (otherwise only the demo workspace has any).
  const extraTenants = []
  const extraPayments = []
  let exReceipt = 5000
  const addCompanyRent = (ownerId, who, rent, months) => {
    const [fn, ...rest] = who.split(' '); const tid = uid()
    extraTenants.push({ id: tid, manager_id: ownerId, property_id: null, first_name: fn, last_name: rest.join(' '),
      email: `${fn.toLowerCase()}@example.com`, phone: '', unit: '', rent, due_day: 1, account_status: 'active', status: 'paid',
      total_paid: rent * months, credit_balance: 0, first_login: false, email_verified: true, phone_verified: true,
      temp_password: null, password: null, created_at: monthsAgo(months).toISOString() })
    for (let i = months; i >= 1; i--) {
      const period = periodForDate(monthsAgo(i), 1)
      extraPayments.push({ id: uid(), tenant_id: tid, manager_id: ownerId, amount: rent, fee: platformFee(rent),
        method: 'EcoCash', reference: 'EC' + Math.floor(Math.random() * 1e6), paid_date: isoDay(monthsAgo(i)),
        period_from: period.from, period_to: period.to, status: 'approved', is_advance: false, credit_amount: 0,
        receipt_no: 'RF-' + (++exReceipt), rejected_reason: null, paid_online: true,
        created_at: monthsAgo(i).toISOString(), approved_at: monthsAgo(i).toISOString() })
    }
  }
  addCompanyRent('mgr-ws4', 'Tariro Madziva', 500, 6)   // Harare Living
  addCompanyRent('mgr-ws4', 'Simba Nyoni', 650, 6)      // Harare Living (2nd tenant)
  addCompanyRent('mgr-ws2', 'Kuda Zhou', 400, 5)        // Blue Roof Homes
  addCompanyRent('mgr-ws3', 'Anesu Sibanda', 250, 4)    // Hove Lettings

  const maintenance = [
    { id: 'mnt-0001', manager_id: managerId, tenant_id: 'ten-0001', property_id: 'prop-0001', unit: 'A1',
      title: 'Leaking kitchen tap', category: 'Plumbing', description: 'The cold tap drips constantly and is wasting water.',
      photo_url: null, priority: 'normal', status: 'open', cost: 0, manager_note: '', caretaker_name: '',
      expense_logged: false, created_at: monthsAgo(0.1).toISOString(), updated_at: monthsAgo(0.1).toISOString(), resolved_at: null },
    { id: 'mnt-0002', manager_id: managerId, tenant_id: 'ten-0003', property_id: 'prop-0002', unit: 'V3',
      title: 'Geyser not heating', category: 'Electrical', description: 'No hot water since yesterday.',
      photo_url: null, priority: 'urgent', status: 'in_progress', cost: 0, manager_note: 'Electrician booked for Friday.', caretaker_name: 'Grace T.',
      expense_logged: false, created_at: monthsAgo(0.4).toISOString(), updated_at: monthsAgo(0.2).toISOString(), resolved_at: null },
  ]

  // ── Payroll — people the OWNER pays (agents, caretakers). Owner-only; each
  // payment is mirrored into the expenses ledger so Finances stays accurate. ──
  const mkPayee = (o) => ({ manager_id: managerId, title: '', phone: '', active: true, ...o })
  const payees = [
    mkPayee({ id: 'pye-1', name: 'Rumbidzai Chari', category: 'Letting agent', pay_type: 'monthly', amount: 450, phone: '0772555001', created_at: monthsAgo(5).toISOString() }),
    mkPayee({ id: 'pye-2', name: 'Tatenda Mhute', category: 'Letting agent', pay_type: 'commission', amount: 10, title: '10% of rent collected', phone: '0772555002', created_at: monthsAgo(5).toISOString() }),
    mkPayee({ id: 'pye-3', name: 'Joseph Moyo', category: 'Caretaker', pay_type: 'monthly', amount: 180, title: 'Avondale Heights', phone: '0772333444', created_at: monthsAgo(6).toISOString() }),
    mkPayee({ id: 'pye-4', name: 'Grace Tendai', category: 'Cleaner', pay_type: 'weekly', amount: 40, title: 'Borrowdale Villas', phone: '0775888999', created_at: monthsAgo(6).toISOString() }),
    mkPayee({ id: 'pye-5', name: 'Tonderai Phiri', category: 'Security guard', pay_type: 'daily', amount: 12, title: 'Night shift', phone: '0773111222', created_at: monthsAgo(4).toISOString() }),
    mkPayee({ id: 'pye-6', name: 'Last Ncube', category: 'Gardener', pay_type: 'task', amount: 25, title: 'Per visit', phone: '0774222333', created_at: monthsAgo(3).toISOString() }),
  ]
  // Seed one paid month for the fixed-salary people so Finances shows it.
  const payroll = []
  payees.filter((p) => p.pay_type === 'monthly').forEach((p) => {
    const period = periodLabel(monthsAgo(1))
    const exId = uid()
    expenses.push({ id: exId, manager_id: managerId, property_id: null, category: 'Salaries', amount: p.amount, spent_on: isoDay(monthsAgo(1)), note: `Salary: ${p.name} (${p.category}) — ${period}`, created_at: monthsAgo(1).toISOString() })
    payroll.push({ id: uid(), manager_id: managerId, payee_id: p.id, name: p.name, category: p.category, amount: p.amount, period, method: 'Bank Transfer', paid_on: isoDay(monthsAgo(1)), note: '', expense_id: exId, created_at: monthsAgo(1).toISOString() })
  })

  return { managers: [manager, ...staff, admin, ...extraOwners], properties: [prop1, prop2], tenants: [...tenants, ...extraTenants], payments: [...payments, ...extraPayments], notifications, reads, otps: [], resets: [], questions: [], expenses, sub_payments, reminder_log: [], messages: [], maintenance, payees, payroll, refunds: [], receipt_seq: 1000 + payments.length }
}
