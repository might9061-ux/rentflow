// ═══════════════════════════════════════════════════════════════════════════
// Automated rent reminders.
//
// The manager defines a ladder of reminder RULES, each firing a set number of
// days relative to a tenant's due date (negative = before, 0 = on, positive =
// overdue). The engine looks at the REAL outstanding balance (from arrears.js)
// and, for each tenant who owes, produces the single most-escalated reminder
// that is due and hasn't been sent yet this billing period.
//
// In demo mode the manager sends the queued reminders (WhatsApp / SMS) with one
// tap. In production the same rules feed a daily Edge Function cron that sends
// them automatically — the engine here is identical, only the trigger differs.
// ═══════════════════════════════════════════════════════════════════════════

import { computeArrears } from './arrears.js'
import { currentPeriod } from './billing.js'
import { money } from './format.js'

const DAY = 86400000

export const DEFAULT_RULES = [
  { id: 'before', label: 'Before due date', kind: 'upcoming', offset: -3, enabled: true,
    template: 'Hi {first_name}, a friendly reminder that your rent of {amount} for {property} is due on {due_date}. Please arrange payment in good time. Thank you — {manager} (via MightyRent).' },
  { id: 'due', label: 'On the due date', kind: 'due', offset: 0, enabled: true,
    template: 'Hi {first_name}, your rent of {amount} for {property} is due today ({due_date}). Kindly make your payment. Thank you — {manager} (via MightyRent).' },
  { id: 'over3', label: '3 days overdue', kind: 'overdue', offset: 3, enabled: true,
    template: 'Hi {first_name}, your rent of {amount} for {property} is now {days} days overdue. Please settle it as soon as possible. Thank you — {manager} (via MightyRent).' },
  { id: 'over7', label: '7 days overdue', kind: 'overdue', offset: 7, enabled: true,
    template: 'Hi {first_name}, your account shows {amount} outstanding for {property} ({days} days overdue). Kindly arrange payment to keep your account in good standing. — {manager} (via MightyRent).' },
  { id: 'over14', label: '14 days overdue', kind: 'overdue', offset: 14, enabled: false,
    template: 'Hi {first_name}, your rent of {amount} for {property} is seriously overdue ({days} days). Please contact us immediately to arrange payment. — {manager} (via MightyRent).' },
]

export function reminderRules(manager) {
  const saved = manager?.reminder_rules
  // Merge any saved overrides onto the defaults by id (keeps a stable shape).
  return DEFAULT_RULES.map((d) => {
    const s = Array.isArray(saved) ? saved.find((x) => x.id === d.id) : null
    return s ? { ...d, ...s } : { ...d }
  })
}
export function remindersEnabled(manager) { return manager?.reminders_enabled !== false }
export function reminderChannel(manager) { return manager?.reminder_channel || 'whatsapp' }

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function dueDateOf(tenant) { return new Date(currentPeriod(Number(tenant.due_day) || 1).from) }
function periodId(tenant) { return currentPeriod(Number(tenant.due_day) || 1).from }

export const SNOOZE_RULE = 'snooze' // a reminder_log entry that skips a tenant for one period

export function sentKey(tenantId, period, ruleId) { return `${tenantId}__${period}__${ruleId}` }

export function fillTemplate(tpl, vars) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''))
}

export function buildReminderMessage(rule, { tenant, manager, property, amount, dueDate, days }) {
  return fillTemplate(rule.template, {
    first_name: tenant.first_name || 'there',
    amount: money(amount),
    property: property?.name || 'your unit',
    due_date: new Date(dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    manager: manager?.first_name || 'your manager',
    days,
  })
}

// → [{ tenant, rule, property, periodId, amount, dueDate, daysOverdue, message }]
export function computeDueReminders({ tenants, payments, properties = [], manager, log = [], today = new Date() }) {
  const rules = reminderRules(manager).filter((r) => r.enabled)
  const sent = new Set(log.map((l) => sentKey(l.tenant_id, l.period, l.rule_id)))
  const propById = new Map(properties.map((p) => [p.id, p]))
  const t0 = startOfDay(today)
  const out = []

  for (const t of tenants) {
    if (t.account_status !== 'active' || !t.phone) continue
    if (t.reminders_muted) continue // opted out entirely until un-muted
    const arr = computeArrears(t, payments)
    if (arr.total <= 0) continue

    const dueDate = dueDateOf(t)
    const pid = periodId(t)
    if (sent.has(sentKey(t.id, pid, SNOOZE_RULE))) continue // skipped this period
    const daysFromDue = Math.floor((t0 - startOfDay(dueDate)) / DAY)

    // The tenant's CURRENT stage = the largest-offset enabled rule that has
    // fired. We only ever consider this one rung — so once it's sent we wait for
    // the next stage instead of falling back and re-sending an earlier reminder.
    const fired = rules.filter((r) => daysFromDue >= r.offset)
    if (!fired.length) continue
    const rule = fired.reduce((a, b) => (b.offset > a.offset ? b : a))
    if (sent.has(sentKey(t.id, pid, rule.id))) continue
    const days = Math.max(0, daysFromDue)
    const property = propById.get(t.property_id)
    out.push({
      tenant: t, rule, property, periodId: pid,
      amount: arr.total, dueDate, daysOverdue: days,
      message: buildReminderMessage(rule, { tenant: t, manager, property, amount: arr.total, dueDate, days }),
    })
  }
  return out.sort((a, b) => b.daysOverdue - a.daysOverdue)
}
