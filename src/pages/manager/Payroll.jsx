import { useEffect, useState, useCallback, Fragment } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { money, fmtDate, timeAgo, initials } from '../../lib/format.js'
import { prettyPhone } from '../../lib/phone.js'
import { PAYMENT_METHODS } from '../../lib/billing.js'
import { Input, Select, Textarea } from '../../components/Field.jsx'
import { StatCard, Spinner, EmptyState } from '../../components/ui.jsx'
import Modal from '../../components/Modal.jsx'
import { IconCash, IconUsers, IconWallet, IconPlus, IconEdit, IconTrash } from '../../components/icons.jsx'

export const WORKER_CATEGORIES = ['Letting agent', 'Caretaker', 'Cleaner', 'Security guard', 'Gardener', 'Maintenance/Handyman', 'Admin/Office', 'Driver', 'Other']

export const PAY_TYPES = [
  { id: 'monthly', label: 'Monthly salary', unit: '/month', perMonth: 1 },
  { id: 'weekly', label: 'Weekly wage', unit: '/week', perMonth: 4.33 },
  { id: 'daily', label: 'Daily wage', unit: '/day', perMonth: 22 },
  { id: 'task', label: 'Per task / job', unit: '/task', perMonth: 0 },
  { id: 'commission', label: 'Commission (%)', unit: '%', perMonth: 0 },
]
const payTypeOf = (id) => PAY_TYPES.find((t) => t.id === id) || PAY_TYPES[0]

function payStructure(p) {
  if (p.pay_type === 'commission') return `${p.amount}% commission`
  return `${money(p.amount)} ${payTypeOf(p.pay_type).unit}`
}
function monthlyEstimate(p) {
  return Number(p.amount || 0) * payTypeOf(p.pay_type).perMonth
}

const thisPeriodLabel = () => new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })
const inThisMonth = (d) => { const t = new Date(d); const n = new Date(); return t.getMonth() === n.getMonth() && t.getFullYear() === n.getFullYear() }

export default function Payroll() {
  const { userId } = useAuth()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [payees, setPayees] = useState([])
  const [payroll, setPayroll] = useState([])
  const [editing, setEditing] = useState(null) // payee or {} for new
  const [paying, setPaying] = useState(null)    // payee being paid
  const [catFilter, setCatFilter] = useState('all')

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([db.listPayees(userId), db.listPayroll(userId)])
    setPayees(p); setPayroll(r); setLoading(false)
  }, [userId])
  useEffect(() => { load() }, [load])

  if (loading) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>

  const active = payees.filter((p) => p.active !== false)
  const monthlyTotal = active.reduce((s, p) => s + monthlyEstimate(p), 0)
  const paidThisMonth = payroll.filter((p) => inThisMonth(p.paid_on || p.created_at)).reduce((s, p) => s + Number(p.amount), 0)
  const lastPaidOf = (id) => payroll.filter((p) => p.payee_id === id).sort((a, b) => new Date(b.paid_on) - new Date(a.paid_on))[0]

  // Group people by worker category (only categories that have someone).
  const usedCategories = WORKER_CATEGORIES.filter((c) => active.some((p) => (p.category || 'Other') === c))
  const shown = catFilter === 'all' ? usedCategories : usedCategories.filter((c) => c === catFilter)

  const remove = async (p) => {
    if (!window.confirm(`Remove ${p.name} from payroll? Their past payments stay in Finances.`)) return
    await db.deletePayee(p.id); toast.success('Removed'); load()
  }

  return (
    <div className="page" style={{ maxWidth: 940 }}>
      <div className="spread page-head">
        <div>
          <div className="eyebrow">Wages</div>
          <h1>Payroll</h1>
          <p>Your workers by category and how they’re paid — every payment is logged to Finances as a salary expense.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing({})}><IconPlus size={16} /> Add worker</button>
      </div>

      <div className="grid stats" style={{ marginBottom: 22 }}>
        <StatCard label="Est. monthly payroll" value={money(monthlyTotal)} sub="Fixed wages (excl. per-task)" icon={<IconCash size={18} />} />
        <StatCard label="Paid this month" value={money(paidThisMonth)} sub={thisPeriodLabel()} icon={<IconWallet size={18} />} />
        <StatCard label="Workers" value={active.length} sub={`${usedCategories.length} categories`} icon={<IconUsers size={18} />} />
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="spread wrap" style={{ padding: '16px 18px 12px', gap: 10 }}>
          <h3>Workers</h3>
          <select className="select" style={{ width: 'auto' }} value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
            <option value="all">All categories</option>
            {usedCategories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="divider" style={{ margin: 0 }} />
        {active.length === 0 ? (
          <EmptyState icon="🧑‍🔧" title="No workers yet">Add an agent, caretaker, cleaner or guard to start paying them.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Worker</th><th>How they’re paid</th><th>Last paid</th><th></th></tr></thead>
              <tbody>
                {shown.map((cat) => {
                  const people = active.filter((p) => (p.category || 'Other') === cat)
                  return (
                    <Fragment key={cat}>
                      <tr className="cat-row"><td colSpan={4}><span className="row gap"><IconUsers size={13} /> <b>{cat}</b> <span className="muted">· {people.length}</span></span></td></tr>
                      {people.map((p) => {
                        const last = lastPaidOf(p.id)
                        return (
                          <tr key={p.id}>
                            <td>
                              <div className="row gap">
                                <div className="avatar" style={{ width: 34, height: 34, fontSize: '0.78rem' }}>{initials(...(p.name || ' ').split(' '))}</div>
                                <div>
                                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                                  <div className="muted" style={{ fontSize: '0.78rem' }}>{[p.title, p.phone && prettyPhone(p.phone)].filter(Boolean).join(' · ') || '—'}</div>
                                </div>
                              </div>
                            </td>
                            <td><span className="pill neutral">{payTypeOf(p.pay_type).label}</span> <span className="mono" style={{ marginLeft: 4 }}>{payStructure(p)}</span></td>
                            <td className="muted nowrap">{last ? <>{fmtDate(last.paid_on)} <span style={{ fontSize: '0.76rem' }}>· {timeAgo(last.paid_on)}</span></> : 'Never'}</td>
                            <td>
                              <div className="row gap" style={{ justifyContent: 'flex-end' }}>
                                <button className="btn sm ok" onClick={() => setPaying(p)}><IconCash size={14} /> Pay</button>
                                <button className="btn sm ghost" title="Edit" onClick={() => setEditing(p)}><IconEdit size={14} /></button>
                                <button className="btn sm ghost danger" title="Remove" onClick={() => remove(p)}><IconTrash size={14} /></button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="spread" style={{ padding: '16px 18px 12px' }}><h3>Payment history</h3></div>
        <div className="divider" style={{ margin: 0 }} />
        {payroll.length === 0 ? (
          <EmptyState icon="🧾" title="No payments yet" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Date</th><th>Person</th><th>For</th><th>Method</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
              <tbody>
                {payroll.slice(0, 20).map((p) => (
                  <tr key={p.id}>
                    <td className="nowrap">{fmtDate(p.paid_on)}</td>
                    <td><div style={{ fontWeight: 600 }}>{p.name}</div><div className="muted" style={{ fontSize: '0.78rem' }}>{p.category || p.role || ''}</div></td>
                    <td className="muted">{p.period || '—'}</td>
                    <td>{p.method}</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--danger)' }}>−{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && <PayeeModal userId={userId} payee={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
      {paying && <PayModal userId={userId} payee={paying} onClose={() => setPaying(null)} onPaid={() => { setPaying(null); load() }} />}
    </div>
  )
}

function PayeeModal({ userId, payee, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!payee
  const [name, setName] = useState(payee?.name || '')
  const [category, setCategory] = useState(payee?.category || WORKER_CATEGORIES[0])
  const [payType, setPayType] = useState(payee?.pay_type || 'monthly')
  const [amount, setAmount] = useState(payee?.amount ?? '')
  const [title, setTitle] = useState(payee?.title || '')
  const [phone, setPhone] = useState(payee?.phone || '')
  const [busy, setBusy] = useState(false)

  const rateLabel = payType === 'commission' ? 'Rate (%)' : `Rate (${payTypeOf(payType).unit.replace('/', 'per ')})`

  const save = async () => {
    if (!name.trim()) return toast.error('Name required')
    setBusy(true)
    try {
      const data = { name: name.trim(), category, pay_type: payType, amount, title, phone }
      if (isEdit) await db.updatePayee(payee.id, data)
      else await db.createPayee(userId, data)
      toast.success(isEdit ? 'Updated' : 'Added to payroll'); onSaved()
    } catch (e) { toast.error('Could not save', e.message); setBusy(false) }
  }

  return (
    <Modal title={isEdit ? `Edit ${payee.name}` : 'Add a worker'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Joseph Moyo" autoFocus />
      <div className="field-row">
        <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          {WORKER_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Input label="Title / note (optional)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Avondale · night shift" />
      </div>
      <div className="field-row">
        <Select label="How they're paid" value={payType} onChange={(e) => setPayType(e.target.value)}>
          {PAY_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </Select>
        <Input label={rateLabel} type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <Input label="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="077 000 0000" />
    </Modal>
  )
}

function PayModal({ userId, payee, onClose, onPaid }) {
  const toast = useToast()
  const [amount, setAmount] = useState(payee.amount || '')
  const [period, setPeriod] = useState(thisPeriodLabel())
  const [method, setMethod] = useState(PAYMENT_METHODS[3] || 'Bank Transfer')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const pay = async () => {
    if (!(Number(amount) > 0)) return toast.error('Enter an amount')
    setBusy(true)
    try {
      await db.payStaff(userId, payee.id, { amount, period, method, paid_on: date, note, name: payee.name, category: payee.category })
      toast.success(`Paid ${payee.name}`, 'Logged to Finances as a salary expense.')
      onPaid()
    } catch (e) { toast.error('Could not record', e.message); setBusy(false) }
  }

  return (
    <Modal title={`Pay ${payee.name}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn ok" onClick={pay} disabled={busy}><IconCash size={15} /> {busy ? 'Saving…' : 'Record payment'}</button></>}>
      <div className="row gap wrap" style={{ marginTop: -6, marginBottom: 12 }}>
        <span className="pill neutral">{payee.category || 'Staff'}</span>
        <span className="muted" style={{ fontSize: '0.84rem' }}>{payStructure(payee)}{payee.title ? ` · ${payee.title}` : ''}</span>
      </div>
      <div className="field-row">
        <Input label="Amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        <Input label="For (period)" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="e.g. October 2025" />
      </div>
      <div className="field-row">
        <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>
          {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
        </Select>
        <Input label="Date paid" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <Textarea label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 64 }} />
      <p className="hint">This records the payment and adds a <b>Salaries</b> expense in Finances.</p>
    </Modal>
  )
}
