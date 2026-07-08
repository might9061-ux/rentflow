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

const FILTERS = [{ id: 'all', label: 'All' }, { id: 'open', label: 'Open' }, { id: 'in_progress', label: 'In progress' }, { id: 'resolved', label: 'Resolved' }]

export default function Maintenance() {
  const { userId } = useAuth()
  const { reloadPending } = useOutletContext() || {}
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [tenants, setTenants] = useState([])
  const [properties, setProperties] = useState([])
  const [filter, setFilter] = useState('open')
  const [managing, setManaging] = useState(null)

  const load = useCallback(async () => {
    const [m, t, p] = await Promise.all([db.listMaintenance(userId), db.listTenants(userId), db.listProperties(userId)])
    setItems(m); setTenants(t); setProperties(p); setLoading(false)
  }, [userId])
  useEffect(() => { load() }, [load])

  if (loading) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>

  const tenantOf = (id) => tenants.find((t) => t.id === id)
  const propName = (id) => properties.find((p) => p.id === id)?.name || '—'
  const open = items.filter((m) => m.status === 'open').length
  const inProg = items.filter((m) => m.status === 'in_progress').length
  const shown = filter === 'all' ? items : items.filter((m) => m.status === filter)

  return (
    <div className="page">
      <div className="page-head">
        <div className="eyebrow">Repairs</div>
        <h1>Maintenance</h1>
        <p>Repair requests from your tenants — assign, track and close them out.</p>
      </div>

      <div className="grid stats" style={{ marginBottom: 22 }}>
        <StatCard label="Open" value={open} sub="Not yet started" icon={<IconWrench size={18} />} />
        <StatCard label="In progress" value={inProg} sub="Being worked on" icon={<IconClock size={18} />} />
        <StatCard label="Resolved" value={items.filter((m) => m.status === 'resolved').length} sub="Closed out" icon={<IconCheckCircle size={18} />} />
      </div>

      <div className="seg" style={{ marginBottom: 18 }}>
        {FILTERS.map((f) => <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>{f.label}</button>)}
      </div>

      {shown.length === 0 ? (
        <div className="card"><EmptyState icon="✅" title="Nothing here">No requests in this view.</EmptyState></div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Issue</th><th>Tenant</th><th>Property / Unit</th><th>Priority</th><th>Status</th><th>Updated</th><th></th></tr></thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id} className="clickable-row" onClick={() => setManaging(m)}>
                  <td><div style={{ fontWeight: 600 }}>{m.title}</div><div className="muted" style={{ fontSize: '0.8rem' }}>{m.category}</div></td>
                  <td>{fullName(tenantOf(m.tenant_id))}</td>
                  <td><div>{propName(m.property_id)}</div><div className="muted" style={{ fontSize: '0.8rem' }}>Unit {m.unit || '—'}</div></td>
                  <td>{m.priority === 'urgent' ? <span className="pill overdue">Urgent</span> : <span className="muted">Normal</span>}</td>
                  <td><StatusTag status={m.status} /></td>
                  <td className="muted nowrap">{timeAgo(m.updated_at)}</td>
                  <td style={{ textAlign: 'right' }}><button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); setManaging(m) }}>Manage</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
      (note ? `\n${note}` : '') + `\n— via RentPilot.`
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
