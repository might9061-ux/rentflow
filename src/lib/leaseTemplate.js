// Custom lease templates — the manager writes their own lease wording ONCE,
// with {{placeholders}}; creating a lease for a tenant fills the gaps from that
// tenant's details. Tolerant matching: {{ Tenant_Name }} == {{tenant_name}}.
import { money, fmtDate, fullName } from './format.js'

// What the manager can put in the gaps. Shown as chips in the editor.
export const PLACEHOLDERS = [
  ['tenant_name', 'Tenant’s full name'],
  ['tenant_email', 'Tenant’s email'],
  ['tenant_phone', 'Tenant’s phone'],
  ['landlord_name', 'Your name / company'],
  ['property', 'Property name'],
  ['unit', 'Unit'],
  ['rent', 'Monthly rent'],
  ['deposit', 'Security deposit'],
  ['currency', 'Currency'],
  ['start_date', 'Lease start date'],
  ['end_date', 'Lease end date'],
  ['term_months', 'Term in months'],
  ['due_day', 'Rent due day'],
]

// A sensible starting point the manager edits into their own lease.
export const STARTER_TEMPLATE = `LEASE AGREEMENT

This agreement is made between {{landlord_name}} (the "Landlord") and {{tenant_name}} (the "Tenant") for {{property}}, Unit {{unit}}.

1. TERM — The lease runs from {{start_date}} to {{end_date}} ({{term_months}} months).

2. RENT — The Tenant shall pay {{rent}} {{currency}} per month, due on day {{due_day}} of each month.

3. DEPOSIT — A security deposit of {{deposit}} {{currency}} is payable on signing, refundable at the end of the tenancy less any lawful deductions.

4. (Add your own clauses here…)`

// Fill {{placeholders}} from the tenant / manager / property / lease terms.
export function fillLeaseTemplate(template, { tenant, manager, property, lease = {} }) {
  const cur = lease.currency || manager?.currency || 'USD'
  const values = {
    tenant_name: fullName(tenant) || '—',
    tenant_email: tenant?.email || '—',
    tenant_phone: tenant?.phone || '—',
    landlord_name: manager?.company || manager?.brand_name || fullName(manager) || '—',
    property: property?.name || '—',
    unit: tenant?.unit || '—',
    rent: lease.rent != null && lease.rent !== '' ? money(Number(lease.rent)) : '—',
    deposit: lease.deposit != null && lease.deposit !== '' ? money(Number(lease.deposit)) : '—',
    currency: cur,
    start_date: lease.start_date ? fmtDate(lease.start_date) : '—',
    end_date: lease.end_date ? fmtDate(lease.end_date) : '—',
    term_months: lease.term_months ?? '—',
    due_day: lease.due_day ?? '—',
  }
  return String(template || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi,
    (m, key) => (key.toLowerCase() in values ? String(values[key.toLowerCase()]) : m))
}
