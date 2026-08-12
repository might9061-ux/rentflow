import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { money, fullName, fmtDate, timeAgo } from '../../lib/format.js'
import { Input, Select, Textarea } from '../../components/Field.jsx'
import { StatCard, Spinner, EmptyState } from '../../components/ui.jsx'
import Modal from '../../components/Modal.jsx'
import { StatusTag } from '../tenant/Maintenance.jsx'
import { IconWrench, IconClock, IconCheckCircle, IconWhatsapp } from '../../components/icons.jsx'
import { sendWhatsApp } from '../../lib/whatsapp.js'

export default function Maintenance() {
  const { userId } = useAuth()
  const { reloadPending } = useOutletContext() || {}
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [tenants, setTenants] = useState([])
  const [properties, setProperties] = useState([])
  const [managing, setManaging] = useState(null)
  const [listView, setListView] = useState(null) // 'open' | 'in_progress' → pop-up list
  const [tasks, setTasks] = useState([])          // facilities diary (plant & machinery)
  const [editingTask, setEditingTask] = useState(null) // null | {} (new) | task
  const [completing, setCompleting] = useState(null)   // task being marked done

  const load = useCallback(async () => {
    // Always clear loading, even if a call fails, so the page can never hang.
    try {
      const [m, t, p, f] = await Promise.all([
        db.listMaintenance(userId), db.listTenants(userId), db.listProperties(userId),
        db.listFacilityTasks ? db.listFacilityTasks(userId).catch(() => []) : Promise.resolve([]),
      ])
      setItems(m); setTenants(t); setProperties(p); setTasks(f)
    } catch (e) { console.error('Maintenance load failed', e) }
    finally { setLoading(false) }
  }, [userId])
  useEffect(() => { load() }, [load])

  if (loading) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>

  const tenantOf = (id) => tenants.find((t) => t.id === id)
  const propName = (id) => properties.find((p) => p.id === id)?.name || '—'
  const byStatus = (s) => items.filter((m) => m.status === s)
  const openList = byStatus('open')
  const inProgList = byStatus('in_progress')
  const resolvedList = byStatus('resolved')

  // One request card, reused in the resolved list and the Open / In-progress
  // pop-ups. Tapping it opens the detail (and closes the pop-up if it was open).
  const RequestCard = (m) => (
    <button key={m.id} type="button" className="card pad mnt-card" onClick={() => { setListView(null); setManaging(m) }}>
      <div className="spread wrap" style={{ gap: 8, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{m.title}</div>
          <div className="muted" style={{ fontSize: '0.8rem' }}>{m.category} · {fullName(tenantOf(m.tenant_id))}</div>
        </div>
        <StatusTag status={m.status} />
      </div>
      <div className="spread wrap" style={{ gap: 8, marginTop: 10, fontSize: '0.8rem' }}>
        <span className="muted">{propName(m.property_id)} · Unit {m.unit || '—'}</span>
        <span className="row gap" style={{ alignItems: 'center' }}>
          {m.priority === 'urgent' && <span className="pill overdue">Urgent</span>}
          <span className="muted">{timeAgo(m.updated_at)}</span>
        </span>
      </div>
    </button>
  )

  const listItems = listView === 'open' ? openList : listView === 'in_progress' ? inProgList : []

  return (
    <div className="page">
      <div className="page-head">
        <div className="eyebrow">Repairs</div>
        <h1>Maintenance</h1>
        <p>Repair requests from your tenants — assign, track and close them out.</p>
      </div>

      {/* Tap Open or In progress to see those in a pop-up; Resolved stays listed below. */}
      <div className="grid stats" style={{ marginBottom: 22 }}>
        <StatCard label="Open" value={openList.length} sub="Not yet started" icon={<IconWrench size={18} />} onClick={() => setListView('open')} />
        <StatCard label="In progress" value={inProgList.length} sub="Being worked on" icon={<IconClock size={18} />} onClick={() => setListView('in_progress')} />
        <StatCard label="Resolved" value={resolvedList.length} sub="Closed out" icon={<IconCheckCircle size={18} />} />
      </div>

      {/* ── Facilities diary — recurring plant & machinery upkeep ─────────── */}
      <div className="spread wrap" style={{ margin: '26px 0 12px', gap: 10 }}>
        <div>
          <h3>Facilities diary</h3>
          <p className="muted" style={{ fontSize: '0.82rem' }}>Scheduled upkeep of plant &amp; machinery — pumps, generators, gates, fire equipment.</p>
        </div>
        <button className="btn primary sm" onClick={() => setEditingTask({})}>+ Add equipment task</button>
      </div>
      {tasks.length === 0 ? (
        <div className="card"><EmptyState icon="🛠️" title="No scheduled tasks yet">Add your equipment — e.g. “Service the borehole pump every 3 months”.</EmptyState></div>
      ) : (
        <div className="mnt-cards">
          {tasks.map((t) => {
            const days = Math.ceil((new Date(t.next_due) - new Date().setHours(0, 0, 0, 0)) / 86400000)
            const state = days < 0 ? ['Overdue', 'overdue'] : days <= 14 ? [days === 0 ? 'Due today' : `Due in ${days}d`, 'pending'] : [`Due ${fmtDate(t.next_due)}`, 'neutral']
            return (
              <div key={t.id} className="card pad">
                <div className="spread wrap" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{t.asset}</div>
                    <div className="muted" style={{ fontSize: '0.8rem' }}>{t.task} · every {t.interval_months} month{t.interval_months > 1 ? 's' : ''} · {propName(t.property_id)}</div>
                  </div>
                  <span className={`pill ${state[1]}`}>{state[0]}</span>
                </div>
                <div className="spread wrap" style={{ gap: 8, marginTop: 10, fontSize: '0.8rem' }}>
                  <span className="muted">{t.last_done ? `Last done ${fmtDate(t.last_done)}` : 'Never done yet'}</span>
                  <span className="row gap">
                    <button className="btn sm ghost" onClick={() => setEditingTask(t)}>Edit</button>
                    <button className="btn sm ok" onClick={() => setCompleting(t)}>Mark done</button>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <h3 style={{ margin: '26px 0 12px' }}>Resolved requests</h3>
      {resolvedList.length === 0 ? (
        <div className="card"><EmptyState icon="✅" title="Nothing resolved yet">Resolved requests show up here.</EmptyState></div>
      ) : (
        <div className="mnt-cards">{resolvedList.map(RequestCard)}</div>
      )}

      {editingTask && (
        <FacilityTaskModal task={editingTask.id ? editingTask : null} properties={properties} userId={userId}
          onClose={() => setEditingTask(null)} onSaved={() => { setEditingTask(null); load() }} />
      )}
      {completing && (
        <CompleteTaskModal task={completing}
          onClose={() => setCompleting(null)} onDone={() => { setCompleting(null); load() }} />
      )}
      <style>{`
        .mnt-cards { display: grid; grid-template-columns: 1fr; gap: 12px; }
        @media (min-width: 720px) { .mnt-cards { grid-template-columns: 1fr 1fr; } }
        .mnt-card { text-align: left; width: 100%; cursor: pointer; transition: border-color .15s, transform .05s; }
        .mnt-card:hover { border-color: var(--accent-line, var(--line)); }
        .mnt-card:active { transform: scale(0.995); }
      `}</style>

      {listView && (
        <Modal title={listView === 'open' ? 'Open requests' : 'In progress requests'} onClose={() => setListView(null)}
          footer={<button className="btn ghost" onClick={() => setListView(null)}>Close</button>}>
          {listItems.length === 0 ? (
            <EmptyState icon="✅" title="Nothing here">No requests in this state.</EmptyState>
          ) : (
            <div className="col" style={{ gap: 12 }}>{listItems.map(RequestCard)}</div>
          )}
        </Modal>
      )}

      {managing && (
        <ManageModal item={managing} tenant={tenantOf(managing.tenant_id)} propName={propName(managing.property_id)}
          onClose={() => setManaging(null)} onSaved={() => { setManaging(null); load(); reloadPending?.() }} />
      )}
    </div>
  )
}

function ManageModal({ item, tenant, propName, onClose, onSaved }) {
  const toast = useToast()
  const [status, setStatus] = useState(item.status)
  const [caretaker, setCaretaker] = useState(item.caretaker_name || '')
  const [cost, setCost] = useState(item.cost || '')
  const [note, setNote] = useState(item.manager_note || '')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      await db.updateMaintenance(item.id, { status, caretaker_name: caretaker, cost: Number(cost) || 0, manager_note: note })
      toast.success('Updated', status === 'resolved' && Number(cost) > 0 ? 'Repair cost logged to expenses.' : undefined)
      onSaved()
    } catch (e) { toast.error('Could not save', e.message); setBusy(false) }
  }

  const updateTenant = () => {
    const msg = `Hi ${tenant?.first_name || 'there'}, an update on your "${item.title}" request: it's now ${status.replace('_', ' ')}.` +
      (note ? `\n${note}` : '') + `\n— via RentLoja.`
    sendWhatsApp(tenant?.phone, msg)
  }

  return (
    <Modal title={item.title} onClose={onClose}
      footer={<>
        <button className="btn ghost wa" onClick={updateTenant}><IconWhatsapp size={15} /> Update tenant</button>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </>}>
      <div className="row gap wrap" style={{ marginBottom: 14 }}>
        <span className="pill neutral">{item.category}</span>
        {item.priority === 'urgent' && <span className="pill overdue">Urgent</span>}
        <span className="muted" style={{ fontSize: '0.82rem' }}>{fullName(tenant)} · {propName} · Unit {item.unit || '—'} · {fmtDate(item.created_at)}</span>
      </div>
      {item.description && <p className="muted" style={{ marginBottom: 12, whiteSpace: 'pre-wrap' }}>{item.description}</p>}
      {item.photo_url && <img src={item.photo_url} alt="" style={{ maxWidth: '100%', borderRadius: 10, border: '1px solid var(--line)', marginBottom: 14 }} />}

      <div className="field-row">
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
        </Select>
        <Input label="Repair cost (USD)" type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)}
          hint="Logged as a property expense when resolved." />
      </div>
      <Input label="Assigned to (caretaker)" value={caretaker} onChange={(e) => setCaretaker(e.target.value)} placeholder="e.g. Joseph M." />
      <Textarea label="Note to tenant" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's being done / when it'll be fixed." style={{ minHeight: 80 }} />
    </Modal>
  )
}

// Add or edit a scheduled equipment task in the facilities diary.
function FacilityTaskModal({ task, properties, userId, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!task
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    asset: task?.asset || '', task: task?.task || '',
    property_id: task?.property_id || properties[0]?.id || '',
    interval_months: task?.interval_months || 3,
    next_due: task?.next_due || new Date().toISOString().slice(0, 10),
    notes: task?.notes || '',
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (!form.asset.trim() || !form.task.trim()) return toast.error('Name the equipment and the task')
    setBusy(true)
    try {
      const data = { ...form, interval_months: Number(form.interval_months) || 1, property_id: form.property_id || null }
      if (isEdit) await db.updateFacilityTask(task.id, data)
      else await db.createFacilityTask(userId, data)
      toast.success(isEdit ? 'Task updated' : 'Added to the diary')
      onSaved()
    } catch (e) { toast.error('Could not save', e.message); setBusy(false) }
  }
  const remove = async () => {
    if (!window.confirm(`Remove "${task.asset} — ${task.task}" and its history?`)) return
    setBusy(true)
    try { await db.deleteFacilityTask(task.id); toast.success('Task removed'); onSaved() }
    catch (e) { toast.error('Could not remove', e.message); setBusy(false) }
  }

  return (
    <Modal title={isEdit ? `Edit — ${task.asset}` : 'Add equipment task'} onClose={onClose}
      footer={<>
        {isEdit && <button className="btn ghost danger" onClick={remove} disabled={busy}>Remove</button>}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : isEdit ? 'Save changes' : 'Add task'}</button>
      </>}>
      <div className="field-row">
        <Input label="Equipment / asset" value={form.asset} onChange={set('asset')} placeholder="e.g. Borehole pump" />
        <Input label="Task" value={form.task} onChange={set('task')} placeholder="e.g. Service & pressure check" />
      </div>
      <div className="field-row">
        <Select label="Property" value={form.property_id} onChange={set('property_id')}>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Input label="Repeat every (months)" type="number" min="1" value={form.interval_months} onChange={set('interval_months')} />
      </div>
      <Input label="Next due" type="date" value={form.next_due} onChange={set('next_due')} />
      <Textarea label="Notes (optional)" value={form.notes} onChange={set('notes')} placeholder="Anything the caretaker should know…" style={{ minHeight: 70 }} />
      <p className="hint">Marking it done logs the service, advances the next due date by the interval, and records any cost as a Maintenance expense.</p>
    </Modal>
  )
}

// Mark a diary task done — logs it, advances next-due, records the cost.
function CompleteTaskModal({ task, onClose, onDone }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ done_at: new Date().toISOString().slice(0, 10), cost: '', done_by: '', note: '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    setBusy(true)
    try {
      await db.completeFacilityTask(task, form)
      toast.success('Logged', Number(form.cost) > 0 ? 'Cost recorded as a Maintenance expense.' : undefined)
      onDone()
    } catch (e) { toast.error('Could not log', e.message); setBusy(false) }
  }

  return (
    <Modal title={`Mark done — ${task.asset}`} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn ok" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Log as done'}</button>
      </>}>
      <p className="muted" style={{ marginTop: 0, fontSize: '0.86rem' }}>{task.task} · next due will move {task.interval_months} month{task.interval_months > 1 ? 's' : ''} on.</p>
      <div className="field-row">
        <Input label="Done on" type="date" value={form.done_at} onChange={set('done_at')} />
        <Input label="Cost (USD, optional)" type="number" min="0" step="0.01" value={form.cost} onChange={set('cost')} />
      </div>
      <Input label="Done by (optional)" value={form.done_by} onChange={set('done_by')} placeholder="Caretaker / contractor" />
      <Textarea label="Note (optional)" value={form.note} onChange={set('note')} placeholder="What was done, parts replaced…" style={{ minHeight: 60 }} />
    </Modal>
  )
}
