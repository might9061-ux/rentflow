import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { fullName, timeAgo } from '../../lib/format.js'
import { prettyPhone } from '../../lib/phone.js'
import { sendWhatsApp, shareToWhatsApp, notificationMessage } from '../../lib/whatsapp.js'
import { sendSMS } from '../../lib/sms.js'
import Modal from '../../components/Modal.jsx'
import { Input, Textarea, Select } from '../../components/Field.jsx'
import { Spinner, EmptyState } from '../../components/ui.jsx'
import { IconPlus, IconBell, IconWarn, IconInfo, IconUsers, IconBuilding, IconWhatsapp, IconSend, IconMail, IconCheck } from '../../components/icons.jsx'

const PRIORITY = {
  normal: { cls: 'neutral', label: 'Normal', icon: IconBell },
  urgent: { cls: 'overdue', label: 'Urgent', icon: IconWarn },
  info: { cls: 'pending', label: 'Info', icon: IconInfo },
}

export default function ManagerNotifications() {
  const { userId, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [tenants, setTenants] = useState([])
  const [properties, setProperties] = useState([])
  const [composing, setComposing] = useState(false)
  const [delivery, setDelivery] = useState(null) // { subject, message, priority, channels, recipients }
  const [stats, setStats] = useState({}) // id -> {read,total}

  // Tenants (with a phone) targeted by a notification's scope.
  const recipientsFor = (scope, propertyId, tenantId) => {
    let list = tenants
    if (scope === 'property') list = tenants.filter((t) => t.property_id === propertyId)
    else if (scope === 'individual') list = tenants.filter((t) => t.id === tenantId)
    return list.filter((t) => t.phone)
  }

  const load = async () => {
    const [n, t, p] = await Promise.all([db.listNotifications(userId), db.listTenants(userId), db.listProperties(userId)])
    setItems(n); setTenants(t); setProperties(p); setLoading(false)
    const s = {}
    await Promise.all(n.map(async (x) => { s[x.id] = await db.notificationStats(x.id) }))
    setStats(s)
  }
  useEffect(() => { load() }, [userId])

  const scopeLabel = (n) => {
    if (n.recipient_scope === 'all') return 'All tenants'
    if (n.recipient_scope === 'property') return properties.find((p) => p.id === n.property_id)?.name || 'Property'
    return fullName(tenants.find((t) => t.id === n.tenant_id)) || 'Individual'
  }

  return (
    <div className="page">
      <div className="spread page-head">
        <div>
          <div className="eyebrow">Broadcast</div>
          <h1>Notifications</h1>
          <p>Send notices to all tenants, a property, or one person.</p>
        </div>
        <button className="btn primary" onClick={() => setComposing(true)}><IconPlus size={16} /> Compose</button>
      </div>

      {loading ? <div className="center" style={{ minHeight: 200 }}><Spinner /></div>
        : items.length === 0 ? (
          <div className="card"><EmptyState icon="🔔" title="No notifications sent">Compose your first notice to tenants.</EmptyState></div>
        ) : (
          /* Read-rate rings — each notice leads with a % read donut, so delivery
             coverage is the first thing you see. */
          <div className="nf-grid">
            {items.map((n) => {
              const pr = PRIORITY[n.priority] || PRIORITY.normal
              const PrIcon = pr.icon
              const st = stats[n.id] || { read: 0, total: 0 }
              const ScopeIcon = n.recipient_scope === 'all' ? IconUsers : n.recipient_scope === 'property' ? IconBuilding : IconUsers
              return (
                <div key={n.id} className="card pad nf-card">
                  <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
                    <ReadRing read={st.read} total={st.total} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '1.02rem', color: 'var(--text)' }}>{n.subject}</div>
                      <div className="row gap wrap" style={{ marginTop: 6 }}>
                        <span className={`pill ${pr.cls}`} style={{ fontSize: '0.68rem', padding: '2px 9px' }}><PrIcon size={11} /> {pr.label}</span>
                        <span className="pill neutral" style={{ fontSize: '0.68rem', padding: '2px 9px' }}><ScopeIcon size={11} /> {scopeLabel(n)}</span>
                        <span className="muted" style={{ fontSize: '0.74rem' }}>{timeAgo(n.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  <p className="muted nf-snip">{n.message}</p>
                  <div className="spread wrap" style={{ gap: 8, marginTop: 'auto', paddingTop: 10 }}>
                    <span className="muted mono" style={{ fontSize: '0.78rem' }}>{st.total ? `${st.read} of ${st.total} read` : 'no recipients yet'}</span>
                    <button className="btn ghost sm wa" onClick={() => setDelivery({
                      subject: n.subject, message: n.message, priority: n.priority,
                      channels: { whatsapp: true, sms: true },
                      recipients: recipientsFor(n.recipient_scope, n.property_id, n.tenant_id),
                    })}><IconWhatsapp size={14} /> WhatsApp / SMS</button>
                  </div>
                </div>
              )
            })}
            <style>{`
              .nf-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
              @media (min-width: 760px) { .nf-grid { grid-template-columns: 1fr 1fr; } }
              .nf-card { display: flex; flex-direction: column; }
              .nf-snip { margin-top: 10px; font-size: 0.86rem; white-space: pre-wrap; overflow: hidden;
                display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
            `}</style>
          </div>
        )}

      {composing && (
        <ComposeModal userId={userId} tenants={tenants} properties={properties}
          onClose={() => setComposing(false)}
          onSent={(payload, channels) => {
            setComposing(false); load()
            if (channels.whatsapp || channels.sms) {
              setDelivery({
                subject: payload.subject, message: payload.message, priority: payload.priority, channels,
                recipients: recipientsFor(payload.recipient_scope, payload.property_id, payload.tenant_id),
              })
            }
          }} />
      )}

      {delivery && <DeliveryModal {...delivery} manager={profile} onClose={() => setDelivery(null)} />}
    </div>
  )
}

// Hand off a notification to tenants over WhatsApp / SMS via pre-filled deep links.
function DeliveryModal({ subject, message, priority, channels, recipients, manager, onClose }) {
  const text = notificationMessage({ subject, message, manager, priority })
  const phones = recipients.map((t) => t.phone)

  // Track who's been messaged. WhatsApp opens one chat per tap, so without this
  // it's easy to lose your place halfway down a list of tenants.
  const [sent, setSent] = useState(() => new Set())
  const markSent = (id) => setSent((s) => new Set(s).add(id))

  // SMS genuinely takes many numbers in one link, so "all" is real here.
  const allSms = () => { sendSMS(phones, text); recipients.forEach((t) => markSent(t.id)) }
  // WhatsApp can't: a group has no number, so this opens WhatsApp's own chat
  // picker with the message ready — choose the tenants' group and send once.
  const toGroup = () => shareToWhatsApp(text)

  const remaining = recipients.filter((t) => !sent.has(t.id)).length

  return (
    <Modal title="Send via WhatsApp / SMS" onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>Done</button>}>

      {channels.whatsapp && (
        <div className="card pad" style={{ marginBottom: 14, background: 'var(--green-bg)', borderColor: 'var(--green-line)' }}>
          <div className="spread wrap" style={{ gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>Send to a WhatsApp group</div>
              <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>
                Reaches everyone in one message. WhatsApp opens — pick your tenants’ group.
              </div>
            </div>
            <button className="btn sm wa" onClick={toGroup}><IconWhatsapp size={14} /> Choose group</button>
          </div>
        </div>
      )}

      <p className="muted" style={{ marginBottom: 12, fontSize: '0.86rem' }}>
        Or message tenants individually below. WhatsApp opens one chat at a time, so tap each in turn —
        ticked names are done.
      </p>

      {recipients.length > 1 && channels.sms && (
        <div className="spread wrap" style={{ gap: 10, marginBottom: 12 }}>
          <span className="muted" style={{ fontSize: '0.84rem' }}>
            {remaining === 0 ? 'All tenants messaged' : `${remaining} of ${recipients.length} still to send`}
          </span>
          <button className="btn sm" onClick={allSms}><IconMail size={14} /> All {recipients.length} via SMS</button>
        </div>
      )}

      {recipients.length === 0 ? (
        <EmptyState icon="📵" title="No phone numbers">
          None of the selected tenants have a phone number on file. Add one on their profile, or use the group above.
        </EmptyState>
      ) : (
        <div className="col" style={{ gap: 8, maxHeight: 340, overflowY: 'auto' }}>
          {recipients.map((t) => {
            const done = sent.has(t.id)
            return (
              <div key={t.id} className="spread" style={{
                padding: '10px 12px', borderRadius: 'var(--radius)',
                border: `1px solid ${done ? 'var(--green-line)' : 'var(--line-soft)'}`,
                background: done ? 'var(--green-bg)' : 'transparent',
              }}>
                <div className="row gap" style={{ minWidth: 0 }}>
                  {done && <IconCheck size={15} style={{ color: 'var(--green)', flexShrink: 0 }} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{fullName(t)}</div>
                    <div className="muted mono" style={{ fontSize: '0.78rem' }}>{prettyPhone(t.phone)}</div>
                  </div>
                </div>
                <div className="row gap">
                  {channels.whatsapp && (
                    <button className="btn sm wa" onClick={() => { sendWhatsApp(t.phone, text); markSent(t.id) }}>
                      <IconWhatsapp size={14} /> {done ? 'Again' : 'WhatsApp'}
                    </button>
                  )}
                  {channels.sms && (
                    <button className="btn sm" onClick={() => { sendSMS(t.phone, text); markSent(t.id) }}>
                      <IconMail size={14} /> SMS
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <p className="hint" style={{ marginTop: 12 }}>
        In-app notifications were already delivered. For automatic bulk sending, connect Africa’s Talking (see README).
      </p>
    </Modal>
  )
}

// The % of recipients who have read a notice, as a small donut — green once
// most have seen it, amber part-way, red when nobody has, grey dash with no
// recipients. Conic-gradient, no chart library.
function ReadRing({ read, total }) {
  const pct = total ? Math.round((read / total) * 100) : null
  const color = pct == null ? 'var(--line)' : pct === 0 ? 'var(--danger)' : pct < 50 ? 'var(--warn)' : 'var(--green)'
  const deg = (pct || 0) * 3.6
  return (
    <span title={total ? `${read} of ${total} read` : 'No recipients yet'} style={{
      width: 54, height: 54, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
      background: `conic-gradient(${color} 0 ${deg}deg, var(--surface-2) ${deg}deg 360deg)`,
      border: '1px solid var(--line-soft)',
    }}>
      <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--surface)', display: 'grid', placeItems: 'center',
        fontSize: '0.74rem', fontWeight: 700, color: pct == null ? 'var(--text-faint)' : color }}>
        {pct == null ? '—' : `${pct}%`}
      </span>
    </span>
  )
}

function ComposeModal({ userId, tenants, properties, onClose, onSent }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    recipient_scope: 'all', property_id: properties[0]?.id || '', tenant_id: tenants[0]?.id || '',
    subject: '', message: '', priority: 'normal',
  })
  const [channels, setChannels] = useState({ whatsapp: false, sms: false })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const toggle = (k) => setChannels((c) => ({ ...c, [k]: !c[k] }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const payload = {
        recipient_scope: form.recipient_scope,
        property_id: form.recipient_scope === 'property' ? form.property_id : null,
        tenant_id: form.recipient_scope === 'individual' ? form.tenant_id : null,
        subject: form.subject, message: form.message, priority: form.priority,
      }
      await db.createNotification(userId, payload)
      toast.success('Notification sent', channels.whatsapp || channels.sms ? 'Now hand it off to tenants.' : undefined)
      onSent(payload, channels)
    } catch (err) { toast.error('Could not send', err.message); setBusy(false) }
  }

  return (
    <Modal title="Compose notification" onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" form="notif-form" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
      </>}>
      <form id="notif-form" onSubmit={submit}>
        <Select label="Send to" value={form.recipient_scope} onChange={set('recipient_scope')}>
          <option value="all">All tenants</option>
          <option value="property">A specific property</option>
          <option value="individual">One tenant</option>
        </Select>

        {form.recipient_scope === 'property' && (
          <Select label="Property" value={form.property_id} onChange={set('property_id')}>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        )}
        {form.recipient_scope === 'individual' && (
          <Select label="Tenant" value={form.tenant_id} onChange={set('tenant_id')}>
            {tenants.map((t) => <option key={t.id} value={t.id}>{fullName(t)} — {t.email}</option>)}
          </Select>
        )}

        <Select label="Priority" value={form.priority} onChange={set('priority')}>
          <option value="normal">Normal</option>
          <option value="urgent">Urgent</option>
          <option value="info">Info</option>
        </Select>
        <Input label="Subject" value={form.subject} onChange={set('subject')} required placeholder="e.g. Water interruption Saturday" />
        <Textarea label="Message" value={form.message} onChange={set('message')} required placeholder="Write your message…" />

        <div className="field">
          <label>Also send by</label>
          <div className="row gap wrap">
            <label className="chk"><input type="checkbox" checked={channels.whatsapp} onChange={() => toggle('whatsapp')} /><IconWhatsapp size={15} /> WhatsApp</label>
            <label className="chk"><input type="checkbox" checked={channels.sms} onChange={() => toggle('sms')} /><IconMail size={15} /> SMS</label>
          </div>
          <span className="hint">In-app is always delivered. WhatsApp/SMS open pre-filled messages to each tenant after sending.</span>
        </div>
      </form>
    </Modal>
  )
}
