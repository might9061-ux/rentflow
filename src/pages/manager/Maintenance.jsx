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

  const load = useCallback(async () => {
    // Always clear loading, even if a call fails, so the page can never hang.
    try {
      const [m, t, p] = await Promise.all([db.listMaintenance(userId), db.listTenants(userId), db.listProperties(userId)])
      setItems(m); setTenants(t); setProperties(p)
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

      <h3 style={{ marginBottom: 12 }}>Resolved requests</h3>
      {resolvedList.length === 0 ? (
        <div className="card"><EmptyState icon="✅" title="Nothing resolved yet">Resolved requests show up here.</EmptyState></div>
      ) : (
        <div className="mnt-cards">{resolvedList.map(RequestCard)}</div>
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
