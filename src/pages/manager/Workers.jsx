import { useEffect, useState, useCallback, Fragment } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { money, fmtDate, timeAgo, initials, fullName } from '../../lib/format.js'
import { prettyPhone } from '../../lib/phone.js'
import { PAYMENT_METHODS } from '../../lib/billing.js'
import {
  WORKER_CATEGORIES, PAY_TYPES, payTypeOf, payStructure, thisPeriodLabel, workerKey,
} from '../../lib/payroll.js'
import { Input, Select, Textarea } from '../../components/Field.jsx'
import { Spinner, EmptyState } from '../../components/ui.jsx'
import Modal from '../../components/Modal.jsx'
import { IconCash, IconUsers, IconPlus, IconEdit, IconTrash, IconShield } from '../../components/icons.jsx'

export default function Workers() {
  const { userId } = useAuth()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [payees, setPayees] = useState([])
  const [payroll, setPayroll] = useState([])
  const [team, setTeam] = useState([])
  const [editing, setEditing] = useState(null) // payee or {} for new
  const [paying, setPaying] = useState(null)    // payee being paid
  const [catFilter, setCatFilter] = useState('all')

  const load = useCallback(async () => {
    const [p, r, t] = await Promise.all([
      db.listPayees(userId),
      db.listPayroll(userId),
      db.listTeam(userId).catch(() => []), // solo owners have no agents
    ])
    setPayees(p); setPayroll(r); setTeam(t); setLoading(false)
  }, [userId])
  useEffect(() => { load() }, [load])

  if (loading) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>

  const active = payees.filter((p) => p.active !== false)
  const lastPaidOf = (id) => id && payroll.filter((p) => p.payee_id === id).sort((a, b) => new Date(b.paid_on) - new Date(a.paid_on))[0]

  // Match each agent to their payroll payee (if one exists yet) so the same
  // person never shows twice — once as an agent, once as a "Letting agent".
  const payeeForAgent = (a) => active.find((p) => workerKey(p.name, p.phone) === workerKey(fullName(a), a.phone))
  const agentPayeeIds = new Set(team.map((a) => payeeForAgent(a)?.id).filter(Boolean))

  // Categories that actually have a non-agent worker in them.
  const usedCategories = WORKER_CATEGORIES.filter((c) => active.some((p) => !agentPayeeIds.has(p.id) && (p.category || 'Other') === c))
  const shownCats = catFilter === 'all' ? usedCategories : usedCategories.filter((c) => c === catFilter)
  const showAgents = team.length > 0 && catFilter === 'all'
  const isEmpty = active.length === 0 && team.length === 0

  const remove = async (p) => {
    if (!window.confirm(`Remove ${p.name} from payroll? Their past payments stay in Finances.`)) return
    await db.deletePayee(p.id); toast.success('Removed'); load()
  }

  // Paying an agent needs a payee behind it (the pay_staff RPC requires one), so
  // create a linked "Letting agent" payee on first pay, then open the pay dialog.
  const payAgent = async (a) => {
    let payee = payeeForAgent(a)
    if (!payee) {
      try {
        payee = await db.createPayee(userId, { name: fullName(a), category: 'Letting agent', pay_type: 'monthly', amount: 0, phone: a.phone || '' })
        setPayees((prev) => [payee, ...prev])
      } catch (e) { return toast.error('Could not start payment', e.message) }
    }
    setPaying(payee)
  }

  return (
    <div className="page" style={{ maxWidth: 940 }}>
      <div className="spread page-head">
        <div>
          <div className="eyebrow">Wages</div>
          <h1>Workers</h1>
          <p>Everyone on your payroll — agents, caretakers, cleaners and guards — grouped by role. Every payment is logged to <Link to="/manager/finances">Finances</Link> as a salary expense.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing({})}><IconPlus size={16} /> Add worker</button>
      </div>

      <div className="card">
        <div className="spread wrap" style={{ padding: '16px 18px 12px', gap: 10 }}>
          <h3>All workers</h3>
          {usedCategories.length > 0 && (
            <select className="select" style={{ width: 'auto' }} value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
              <option value="all">All categories</option>
              {usedCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
        <div className="divider" style={{ margin: 0 }} />
        {isEmpty ? (
          <EmptyState icon="🧑‍🔧" title="No workers yet">Add an agent, caretaker, cleaner or guard to start paying them. Agents you invite on the <Link to="/manager/team">Agents</Link> page show up here too.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Worker</th><th>How they’re paid</th><th>Last paid</th><th></th></tr></thead>
              <tbody>
                {showAgents && (
                  <Fragment>
                    <tr className="cat-row"><td colSpan={4}><span className="row gap"><IconShield size={13} /> <b>Agents</b> <span className="muted">· {team.length} · manage access on the Agents page</span></span></td></tr>
                    {team.map((a) => {
                      const payee = payeeForAgent(a)
                      const last = lastPaidOf(payee?.id)
                      return (
                        <tr key={a.id}>
                          <td>
                            <div className="row gap">
                              <div className="avatar" style={{ width: 34, height: 34, fontSize: '0.78rem' }}>{initials(a.first_name, a.last_name)}</div>
                              <div>
                                <div style={{ fontWeight: 600 }}>{fullName(a)}</div>
                                <div className="muted" style={{ fontSize: '0.78rem' }}>{[a.email, a.phone && prettyPhone(a.phone)].filter(Boolean).join(' · ') || '—'}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="pill gold">Agent</span>
                            {payee ? <span className="mono" style={{ marginLeft: 4 }}>{payStructure(payee)}</span> : <span className="muted" style={{ marginLeft: 4, fontSize: '0.82rem' }}>Set on first pay</span>}
                          </td>
                          <td className="muted nowrap">{last ? <>{fmtDate(last.paid_on)} <span style={{ fontSize: '0.76rem' }}>· {timeAgo(last.paid_on)}</span></> : 'Never'}</td>
                          <td>
                            <div className="row gap" style={{ justifyContent: 'flex-end' }}>
                              <button className="btn sm ok" onClick={() => payAgent(a)}><IconCash size={14} /> Pay</button>
                              <Link className="btn sm ghost" to="/manager/team" title="Edit on the Agents page"><IconEdit size={14} /></Link>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </Fragment>
                )}

                {shownCats.map((cat) => {
                  const people = active.filter((p) => !agentPayeeIds.has(p.id) && (p.category || 'Other') === cat)
                  if (people.length === 0) return null
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
