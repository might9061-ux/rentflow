import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { money, fmtDate, timeAgo } from '../../lib/format.js'
import { fileToProof } from '../../lib/upload.js'
import { Input, Select, Textarea } from '../../components/Field.jsx'
import { Spinner, EmptyState } from '../../components/ui.jsx'
import Modal from '../../components/Modal.jsx'
import { IconWrench, IconPlus, IconReceipt, IconCheck, IconArrowRight } from '../../components/icons.jsx'

export const CATEGORIES = ['Plumbing', 'Electrical', 'Appliance', 'Structural', 'Pest control', 'Security', 'General']

export const MSTATUS = {
  open: { cls: 'gold', label: 'Open' },
  in_progress: { cls: 'neutral', label: 'In progress' },
  resolved: { cls: 'ok', label: 'Resolved' },
}

export function StatusTag({ status }) {
  const s = MSTATUS[status] || MSTATUS.open
  return <span className={`pill ${s.cls}`}>{status === 'resolved' && <IconCheck size={11} />} {s.label}</span>
}

export default function TenantMaintenance() {
  const { userId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [creating, setCreating] = useState(false)
  const [viewing, setViewing] = useState(null)

  const load = useCallback(async () => {
    setItems(await db.listTenantMaintenance(userId)); setLoading(false)
  }, [userId])
  useEffect(() => { load() }, [load])

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="spread page-head">
        <div>
          <div className="eyebrow">Repairs</div>
          <h1>Maintenance</h1>
          <p>Report a repair or issue — your manager is notified and you can track progress here.</p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}><IconPlus size={16} /> New request</button>
      </div>

      {loading ? <div className="center" style={{ minHeight: 200 }}><Spinner /></div>
        : items.length === 0 ? (
          <div className="card"><EmptyState icon="🛠️" title="No requests yet">Tap “New request” to report a repair.</EmptyState></div>
        ) : (
          <div className="col" style={{ gap: 12 }}>
            {items.map((m) => (
              <button key={m.id} type="button" className="card pad clickable-row" onClick={() => setViewing(m)}
                style={{ textAlign: 'left', width: '100%', cursor: 'pointer' }}>
                <div className="spread wrap" style={{ gap: 8 }}>
                  <div className="row gap"><IconWrench size={16} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontWeight: 600 }}>{m.title}</span></div>
                  <StatusTag status={m.status} />
                </div>
                <div className="row gap wrap" style={{ marginTop: 8 }}>
                  <span className="pill neutral">{m.category}</span>
                  {m.priority === 'urgent' && <span className="pill overdue">Urgent</span>}
                  <span className="muted" style={{ fontSize: '0.8rem' }}>{timeAgo(m.created_at)}</span>
                  {m.manager_note && <span className="muted row gap" style={{ fontSize: '0.8rem' }}><IconReceipt size={12} /> Manager replied</span>}
                  <span className="row gap muted" style={{ marginLeft: 'auto', fontSize: '0.82rem' }}>View <IconArrowRight size={13} /></span>
                </div>
              </button>
            ))}
          </div>
        )}

      {creating && <RequestModal userId={userId} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load() }} />}
      {viewing && <DetailModal item={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

function DetailModal({ item: m, onClose }) {
  return (
    <Modal title={m.title} onClose={onClose} footer={<button className="btn ghost" onClick={onClose}>Close</button>}>
      <div className="row gap wrap" style={{ marginBottom: 14 }}>
        <StatusTag status={m.status} />
        <span className="pill neutral">{m.category}</span>
        {m.priority === 'urgent' && <span className="pill overdue">Urgent</span>}
        <span className="muted" style={{ fontSize: '0.82rem' }}>Reported {fmtDate(m.created_at)}</span>
      </div>

      {m.description
        ? <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{m.description}</p>
        : <p className="muted">No extra details were added.</p>}

      {m.photo_url && <img src={m.photo_url} alt="" style={{ marginTop: 12, width: '100%', borderRadius: 11, border: '1px solid var(--line)' }} />}

      {m.manager_note && (
        <div className="banner" style={{ marginTop: 16 }}>
          <div className="b-ico"><IconReceipt size={16} /></div>
          <div style={{ fontSize: '0.88rem' }}><b>Manager:</b> {m.manager_note}{m.caretaker_name ? ` · Assigned to ${m.caretaker_name}` : ''}</div>
        </div>
      )}

      {m.status === 'resolved' && (
        <div className="banner ok" style={{ marginTop: 12 }}>
          <div className="b-ico"><IconCheck size={16} /></div>
          <div style={{ fontSize: '0.88rem' }}>
            Resolved{m.resolved_at ? ` on ${fmtDate(m.resolved_at)}` : ''}{m.cost > 0 ? ` · Repair cost ${money(m.cost)}` : ''}.
          </div>
        </div>
      )}
    </Modal>
  )
}

function RequestModal({ userId, onClose, onCreated }) {
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('normal')
  const [photo, setPhoto] = useState(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const onFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    try { setPhoto(await fileToProof(f)) } catch (err) { toast.error('Upload failed', err.message) }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return toast.error('Add a short title')
    setBusy(true)
    try {
      await db.createMaintenanceRequest(userId, { title: title.trim(), category, description, priority, photo_url: photo?.url || null })
      toast.success('Request sent', 'Your manager has been notified.')
      onCreated()
    } catch (err) { toast.error('Could not send', err.message); setBusy(false) }
  }

  return (
    <Modal title="Report a repair" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button></>}>
      <Input label="What's the issue?" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Leaking kitchen tap" autoFocus />
      <div className="field-row">
        <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="normal">Normal</option>
          <option value="urgent">Urgent</option>
        </Select>
      </div>
      <Textarea label="Details" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the problem so it can be fixed quickly." style={{ minHeight: 90 }} />
      <div className="field">
        <label>Photo (optional)</label>
        <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
        {photo ? (
          <div className="row gap">
            <img src={photo.url} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 9, border: '1px solid var(--line)' }} />
            <button type="button" className="btn sm ghost" onClick={() => setPhoto(null)}>Remove</button>
          </div>
        ) : (
          <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}><IconReceipt size={15} /> Add a photo</button>
        )}
      </div>
    </Modal>
  )
}
