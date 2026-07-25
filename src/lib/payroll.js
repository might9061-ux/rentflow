// Shared payroll helpers — used by the Payroll overview and the Workers page.
import { money } from './format.js'

export const WORKER_CATEGORIES = ['Letting agent', 'Caretaker', 'Cleaner', 'Security guard', 'Gardener', 'Maintenance/Handyman', 'Admin/Office', 'Driver', 'Other']

export const PAY_TYPES = [
  { id: 'monthly', label: 'Monthly salary', unit: '/month', perMonth: 1 },
  { id: 'weekly', label: 'Weekly wage', unit: '/week', perMonth: 4.33 },
  { id: 'daily', label: 'Daily wage', unit: '/day', perMonth: 22 },
  { id: 'task', label: 'Per task / job', unit: '/task', perMonth: 0 },
  { id: 'commission', label: 'Commission (%)', unit: '%', perMonth: 0 },
]
export const payTypeOf = (id) => PAY_TYPES.find((t) => t.id === id) || PAY_TYPES[0]

export function payStructure(p) {
  if (p.pay_type === 'commission') return `${p.amount}% commission`
  return `${money(p.amount)} ${payTypeOf(p.pay_type).unit}`
}
export function monthlyEstimate(p) {
  return Number(p.amount || 0) * payTypeOf(p.pay_type).perMonth
}

export const thisPeriodLabel = () => new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })
export const inThisMonth = (d) => { const t = new Date(d); const n = new Date(); return t.getMonth() === n.getMonth() && t.getFullYear() === n.getFullYear() }

// A stable key for matching an agent (from the Agents page) to their payroll
// payee record — normalised name + phone, so the same person lines up across
// the two lists without needing a schema-level foreign key.
export const workerKey = (name, phone) => `${(name || '').trim().toLowerCase()}|${(phone || '').replace(/\D/g, '')}`
