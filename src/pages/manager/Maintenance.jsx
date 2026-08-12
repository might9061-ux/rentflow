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
  const [history, setHistory] = useState([])      // completed services (calendar history)
  const [editingTask, setEditingTask] = useState(null) // null | {next_due?} (new) | task
  const [completing, setCompleting] = useState(null)   // task being marked done
  const [editingLog, setEditingLog] = useState(null)   // { log, task } — fix a logged completion

  const load = useCallback(async () => {
    // Always clear loading, even if a call fails, so the page can never hang.
    try {
      const [m, t, p, f, h] = await Promise.all([
        db.listMaintenance(userId), db.listTenants(userId), db.listProperties(userId),
        db.listFacilityTasks ? db.listFacilityTasks(userId).catch(() => []) : Promise.resolve([]),
        db.listFacilityHistory ? db.listFacilityHistory(userId).catch(() => []) : Promise.resolve([]),
      ])
      setItems(m); setTenants(t); setProperties(p); setTasks(f); setHistory(h)
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

  const listItems = listView === 'open' ? openList : listView === 'in_progress' ? inProgList : listView === 'resolved' ? resolvedList : []

  return (
    <div className="page">
      <div className="page-head">
        <div className="eyebrow">Repairs</div>
        <h1>Maintenance</h1>
        <p>Repair requests from your tenants — assign, track and close them out.</p>
      </div>

      {/* Calendar hero — the diary's month at a glance. Dots mark due dates
          (red overdue, amber soon, azure later); tap a day to see its tasks. */}
      <DiaryCalendar tasks={tasks} history={history} propName={propName}
        onMarkDone={(t) => setCompleting(t)}
        onAddOn={(dayIso) => setEditingTask({ next_due: dayIso })}
        onEditLog={(log, task) => setEditingLog({ log, task })} />

      {/* Tap Open or In progress to see those in a pop-up; Resolved stays listed below. */}
      <div className="grid stats" style={{ marginBottom: 22 }}>
        <StatCard label="Open" value={openList.length} sub="Not yet started" icon={<IconWrench size={18} />} onClick={() => setListView('open')} />
        <StatCard label="In progress" value={inProgList.length} sub="Being worked on" icon={<IconClock size={18} />} onClick={() => setListView('in_progress')} />
        <StatCard label="Resolved" value={resolvedList.length} sub="Closed out" icon={<IconCheckCircle size={18} />} onClick={() => setListView('resolved')} />
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
        /* Executive rows — one joined list with a status dot per task, matching
           the Properties page. Row click edits; Done ✓ logs a completion. */
        <div className="card">
          {tasks.map((t) => {
            const days = Math.ceil((new Date(t.next_due) - new Date().setHours(0, 0, 0, 0)) / 86400000)
            const dot = days < 0 ? 'var(--danger)' : days <= 14 ? 'var(--warn)' : 'var(--accent)'
            const when = days < 0 ? ['Overdue', 'var(--danger)'] : days === 0 ? ['Due today', 'var(--warn)']
              : days <= 14 ? [`In ${days}d`, 'var(--warn)'] : [fmtDate(t.next_due), 'var(--text-dim)']
            return (
              <div key={t.id} className="fac-row" role="button" tabIndex={0}
                onClick={() => setEditingTask(t)}
                onKeyDown={(e) => { if (e.key === 'Enter') setEditingTask(t) }}>
                <span className="fac-dot" style={{ background: dot }} />
                <div className="fac-main">
                  <span style={{ fontWeight: 600 }}>{t.asset}</span>
                  <span className="muted"> · {t.task}</span>
                  <div className="muted fac-sub">every {t.interval_months} {t.interval_unit === 'weeks' ? 'wk' : 'mo'} · {propName(t.property_id)}{t.last_done ? ` · last ${fmtDate(t.last_done)}` : ''}</div>
                </div>
                <span className="fac-when" style={{ color: when[1] }}>{when[0]}</span>
                <button className="btn sm ok" onClick={(e) => { e.stopPropagation(); setCompleting(t) }}>Done ✓</button>
              </div>
            )
          })}
          <style>{`
            .fac-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px;
              border-bottom: 1px solid var(--line-soft); cursor: pointer; transition: background 0.13s; }
            .fac-row:last-of-type { border-bottom: none; }
            .fac-row:hover { background: var(--accent-bg); }
            .fac-row:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--accent); }
            .fac-dot { width: 9px; height: 9px; border-radius: 99px; flex-shrink: 0; }
            .fac-main { flex: 1; min-width: 0; font-size: 0.92rem; }
            .fac-sub { font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .fac-when { font-size: 0.82rem; font-weight: 600; white-space: nowrap; }
            @media (max-width: 560px) { .fac-sub { white-space: normal; } }
          `}</style>
        </div>
      )}

      {editingTask && (
        <FacilityTaskModal task={editingTask.id ? editingTask : null} initialDate={editingTask.next_due} properties={properties} userId={userId}
          onClose={() => setEditingTask(null)} onSaved={() => { setEditingTask(null); load() }} />
      )}
      {completing && (
        <CompleteTaskModal task={completing}
          onClose={() => setCompleting(null)} onDone={() => { setCompleting(null); load() }} />
      )}
      {editingLog && (
        <EditLogModal log={editingLog.log} task={editingLog.task}
          onClose={() => setEditingLog(null)} onSaved={() => { setEditingLog(null); load() }} />
      )}
      <style>{`
        .mnt-cards { display: grid; grid-template-columns: 1fr; gap: 12px; }
        @media (min-width: 720px) { .mnt-cards { grid-template-columns: 1fr 1fr; } }
        .mnt-card { text-align: left; width: 100%; cursor: pointer; transition: border-color .15s, transform .05s; }
        .mnt-card:hover { border-color: var(--accent-line, var(--line)); }
        .mnt-card:active { transform: scale(0.995); }
      `}</style>

      {listView && (
        <Modal title={listView === 'open' ? 'Open requests' : listView === 'in_progress' ? 'In progress requests' : 'Resolved requests'} onClose={() => setListView(null)}
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
function FacilityTaskModal({ task, initialDate, properties, userId, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!task
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    asset: task?.asset || '', task: task?.task || '',
    property_id: task?.property_id || properties[0]?.id || '',
    interval_months: task?.interval_months || 3,
    interval_unit: task?.interval_unit || 'months',
    next_due: task?.next_due || initialDate || new Date().toISOString().slice(0, 10),
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
        <div className="field">
          <label>Repeat every</label>
          <div className="row gap">
            <input className="input" type="number" min="1" style={{ width: 80 }} value={form.interval_months} onChange={set('interval_months')} />
            <select className="select" value={form.interval_unit} onChange={set('interval_unit')} style={{ flex: 1 }}>
              <option value="weeks">weeks</option>
              <option value="months">months</option>
            </select>
          </div>
        </div>
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
      <p className="muted" style={{ marginTop: 0, fontSize: '0.86rem' }}>{task.task} · next due will move {task.interval_months} {task.interval_unit === 'weeks' ? 'week' : 'month'}{task.interval_months > 1 ? 's' : ''} on.</p>
      <div className="field-row">
        <Input label="Done on" type="date" value={form.done_at} onChange={set('done_at')} />
        <Input label="Cost (USD, optional)" type="number" min="0" step="0.01" value={form.cost} onChange={set('cost')} />
      </div>
      <Input label="Done by (optional)" value={form.done_by} onChange={set('done_by')} placeholder="Caretaker / contractor" />
      <Textarea label="Note (optional)" value={form.note} onChange={set('note')} placeholder="What was done, parts replaced…" style={{ minHeight: 60 }} />
    </Modal>
  )
}

// Month calendar for the facilities diary. Dots mark diary due-dates — red for
// overdue, amber due within 14 days, azure later — and GREEN dots are history:
// services already done stay on the day they happened, so past months read as a
// service record. Tap any day to see its tasks/history, or add a task for it.
function DiaryCalendar({ tasks, history = [], propName, onMarkDone, onAddOn, onEditLog }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [picked, setPicked] = useState(null) // ISO day whose tasks are shown

  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const todayIso = iso(new Date())
  const byDay = {}
  for (const t of tasks) (byDay[t.next_due] = byDay[t.next_due] || []).push(t)
  const doneByDay = {}
  for (const l of history) (doneByDay[l.done_at] = doneByDay[l.done_at] || []).push(l)
  const taskById = (id) => tasks.find((t) => t.id === id)

  // Monday-first grid covering the whole month.
  const first = new Date(month)
  const startOffset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d))
  while (cells.length % 7) cells.push(null)

  const dotColor = (dayIso) => dayIso < todayIso ? 'var(--danger)'
    : (new Date(dayIso) - new Date(todayIso)) / 86400000 <= 14 ? 'var(--warn)' : 'var(--accent)'
  const label = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const move = (n) => { setPicked(null); setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1)) }
  const pickedTasks = picked ? (byDay[picked] || []) : []
  const pickedDone = picked ? (doneByDay[picked] || []) : []

  return (
    <div className="card pad" style={{ marginBottom: 22 }}>
      <div className="spread" style={{ marginBottom: 10 }}>
        <h3 style={{ fontSize: '1.1rem' }}>Facilities calendar</h3>
        <div className="row gap">
          <button className="btn sm ghost" onClick={() => move(-1)} aria-label="Previous month">‹</button>
          <b style={{ fontSize: '0.92rem', minWidth: 130, textAlign: 'center' }}>{label}</b>
          <button className="btn sm ghost" onClick={() => move(1)} aria-label="Next month">›</button>
        </div>
      </div>

      <div className="cal-grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="cal-h">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="cal-cell empty" />
          const dayIso = iso(d)
          const due = byDay[dayIso] || []
          const done = doneByDay[dayIso] || []
          const isToday = dayIso === todayIso
          return (
            <button key={dayIso} type="button"
              className={`cal-cell ${isToday ? 'today' : ''} ${picked === dayIso ? 'picked' : ''} ${(due.length || done.length) ? 'has' : ''}`}
              onClick={() => setPicked(picked === dayIso ? null : dayIso)}>
              <span className="cal-n">{d.getDate()}</span>
              {(due.length > 0 || done.length > 0) && (
                <span className="cal-dots">
                  {due.slice(0, 2).map((t) => <span key={t.id} className="cal-dot" style={{ background: dotColor(dayIso) }} />)}
                  {done.slice(0, 2).map((l) => <span key={l.id} className="cal-dot" style={{ background: 'var(--green)' }} />)}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {picked && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--line-soft)', paddingTop: 12 }}>
          <div className="spread" style={{ marginBottom: 8 }}>
            <div className="muted" style={{ fontSize: '0.78rem' }}>{fmtDate(picked)}</div>
            <button className="btn sm ghost" onClick={() => onAddOn(picked)}>+ Add equipment task on this day</button>
          </div>
          {pickedTasks.map((t) => (
            <div key={t.id} className="spread wrap" style={{ gap: 8, padding: '8px 0' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t.asset}</div>
                <div className="muted" style={{ fontSize: '0.78rem' }}>{t.task} · {propName(t.property_id)} · due</div>
              </div>
              <button className="btn sm ok" onClick={() => onMarkDone(t)}>Mark done</button>
            </div>
          ))}
          {pickedDone.map((l) => {
            const t = taskById(l.task_id)
            return (
              <div key={l.id} className="spread wrap" style={{ gap: 8, padding: '8px 0' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--green)' }}>✓ {t ? t.asset : 'Equipment'}</div>
                  <div className="muted" style={{ fontSize: '0.78rem' }}>
                    {t ? `${t.task} · ` : ''}done{l.done_by ? ` by ${l.done_by}` : ''}{Number(l.cost) > 0 ? ` · ${money(Number(l.cost))}` : ''}{l.note ? ` · ${l.note}` : ''}
                  </div>
                </div>
                <button className="btn sm ghost" onClick={() => onEditLog(l, t)}>Edit</button>
              </div>
            )
          })}
          {pickedTasks.length === 0 && pickedDone.length === 0 && (
            <div className="muted" style={{ fontSize: '0.8rem' }}>Nothing scheduled or done on this day.</div>
          )}
        </div>
      )}

      <div className="row gap wrap" style={{ marginTop: 10, fontSize: '0.72rem', color: 'var(--text-faint)' }}>
        <span className="row" style={{ gap: 5, alignItems: 'center' }}><span className="cal-dot" style={{ background: 'var(--danger)' }} /> Overdue</span>
        <span className="row" style={{ gap: 5, alignItems: 'center' }}><span className="cal-dot" style={{ background: 'var(--warn)' }} /> Due soon</span>
        <span className="row" style={{ gap: 5, alignItems: 'center' }}><span className="cal-dot" style={{ background: 'var(--accent)' }} /> Scheduled</span>
        <span className="row" style={{ gap: 5, alignItems: 'center' }}><span className="cal-dot" style={{ background: 'var(--green)' }} /> Done (history)</span>
      </div>

      <style>{`
        .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
        .cal-h { text-align: center; font-size: 0.66rem; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text-faint); padding: 4px 0; }
        .cal-cell { position: relative; min-height: 44px; border: 1px solid transparent; border-radius: 7px;
          background: var(--bg); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
          font-family: inherit; color: var(--text); }
        .cal-cell.empty { background: transparent; }
        .cal-cell.has { cursor: pointer; border-color: var(--line-soft); }
        .cal-cell.has:hover { border-color: var(--accent-line); }
        .cal-cell.today { border-color: var(--accent); }
        .cal-cell.today .cal-n { color: var(--accent); font-weight: 700; }
        .cal-cell.picked { background: var(--accent-bg); border-color: var(--accent); }
        .cal-n { font-size: 0.8rem; line-height: 1; }
        .cal-dots { display: flex; gap: 3px; }
        .cal-dot { width: 10px; height: 10px; border-radius: 99px; display: inline-block; }
        @media (max-width: 560px) { .cal-cell { min-height: 38px; } }
      `}</style>
    </div>
  )
}

// Fix a logged completion. The record is otherwise immutable — this is the only
// way to change it, and the linked Maintenance expense is kept in step (cost
// changed → updated; cleared → removed; added → created).
function EditLogModal({ log, task, onClose, onSaved }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    done_at: log.done_at, cost: Number(log.cost) > 0 ? String(log.cost) : '',
    done_by: log.done_by || '', note: log.note || '',
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    setBusy(true)
    try {
      await db.updateFacilityLog(log, form, task)
      toast.success('Record updated', 'The service log — and its expense — now match.')
      onSaved()
    } catch (e) { toast.error('Could not update', e.message); setBusy(false) }
  }

  return (
    <Modal title={`Edit record — ${task?.asset || 'Equipment'}`} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      </>}>
      <p className="muted" style={{ marginTop: 0, fontSize: '0.84rem' }}>
        {task ? `${task.task} · ` : ''}logged {fmtDate(log.done_at)}. Changing the cost updates the expense in Finances too.
      </p>
      <div className="field-row">
        <Input label="Done on" type="date" value={form.done_at} onChange={set('done_at')} />
        <Input label="Cost (USD)" type="number" min="0" step="0.01" value={form.cost} onChange={set('cost')} />
      </div>
      <Input label="Done by" value={form.done_by} onChange={set('done_by')} placeholder="Caretaker / contractor" />
      <Textarea label="Note" value={form.note} onChange={set('note')} style={{ minHeight: 60 }} />
    </Modal>
  )
}
