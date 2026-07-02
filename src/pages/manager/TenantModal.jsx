import { useState, useRef } from 'react'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { fileToProof } from '../../lib/upload.js'
import { isValidEmail } from '../../lib/format.js'
import Modal from '../../components/Modal.jsx'
import { Input, EmailInput, Select, Row } from '../../components/Field.jsx'
import PhoneInput from '../../components/PhoneInput.jsx'
import { IconReceipt } from '../../components/icons.jsx'

const STATUSES = ['pending', 'paid', 'due', 'overdue', 'inactive']
const ACCOUNT_STATUSES = ['pending_verification', 'active', 'suspended']

// Add (new) or Edit (all fields incl. rent, unit, due_day, status, credit) a tenant.
export default function TenantModal({ tenant, properties, userId, onClose, onCreated, onUpdated }) {
  const toast = useToast()
  const isNew = !tenant?.id
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    first_name: tenant?.first_name || '', last_name: tenant?.last_name || '',
    email: tenant?.email || '', phone: tenant?.phone || '',
    property_id: tenant?.property_id || (properties[0]?.id || ''),
    unit: tenant?.unit || '', rent: tenant?.rent ?? '', due_day: tenant?.due_day ?? 1,
    lease_start: tenant?.lease_start || '', lease_end: tenant?.lease_end || '', status: tenant?.status || 'pending',
    account_status: tenant?.account_status || 'pending_verification',
    credit_balance: tenant?.credit_balance ?? 0,
    lease_doc: tenant?.lease_doc || null, lease_doc_name: tenant?.lease_doc_name || null,
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const fileRef = useRef(null)

  const onLeaseFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const proof = await fileToProof(file)
      setForm((f) => ({ ...f, lease_doc: proof.url, lease_doc_name: proof.name }))
    } catch (err) { toast.error('Upload failed', err.message) }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!isValidEmail(form.email)) return toast.error('Invalid email', 'Enter a valid email address for the tenant.')
    if (!form.phone) return toast.error('Phone required', 'Add the tenant’s phone number.')
    setBusy(true)
    try {
      const payload = {
        ...form,
        rent: Number(form.rent) || 0,
        due_day: Number(form.due_day) || 1,
        credit_balance: Number(form.credit_balance) || 0,
        property_id: form.property_id || null,
      }
      if (isNew) {
        const { tenant: created, tempPassword } = await db.createTenant(userId, payload)
        onCreated(created, tempPassword)
      } else {
        const updated = await db.updateTenant(tenant.id, payload)
        toast.success('Tenant updated')
        onUpdated(updated)
      }
    } catch (err) { toast.error('Could not save', err.message); setBusy(false) }
  }

  return (
    <Modal wide title={isNew ? 'Add tenant' : `Edit ${tenant.first_name} ${tenant.last_name}`} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" form="tenant-form" disabled={busy}>
          {busy ? 'Saving…' : isNew ? 'Create tenant & get credentials' : 'Save changes'}
        </button>
      </>}>
      <form id="tenant-form" onSubmit={submit}>
        <Row>
          <Input label="First name" value={form.first_name} onChange={set('first_name')} required autoFocus />
          <Input label="Last name" value={form.last_name} onChange={set('last_name')} required />
        </Row>
        <Row>
          <EmailInput label="Email" value={form.email} onChange={set('email')} required
            hint={isNew ? 'Login username for the tenant' : undefined} />
          <PhoneInput label="Phone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} required />
        </Row>
        <Row>
          <Select label="Property" value={form.property_id} onChange={set('property_id')}>
            <option value="">— Unassigned —</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Input label="Unit" value={form.unit} onChange={set('unit')} placeholder="e.g. A2" />
        </Row>
        <Row>
          <Input label="Monthly rent (USD)" type="number" min="0" step="0.01" value={form.rent} onChange={set('rent')} required />
          <Input label="Due day (1–31)" type="number" min="1" max="31" value={form.due_day} onChange={set('due_day')} required />
        </Row>
        <Row>
          <Input label="Lease start" type="date" value={form.lease_start || ''} onChange={set('lease_start')} />
          <Input label="Lease end" type="date" value={form.lease_end || ''} onChange={set('lease_end')} />
        </Row>
        <Row>
          <Input label="Credit balance (USD)" type="number" min="0" step="0.01" value={form.credit_balance} onChange={set('credit_balance')}
            hint="Advance carried forward" />
          <div className="field">
            <label>Lease document</label>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={onLeaseFile} style={{ display: 'none' }} />
            <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()} style={{ justifyContent: 'flex-start' }}>
              <IconReceipt size={15} /> {form.lease_doc ? (form.lease_doc_name || 'Replace document') : 'Upload lease (PDF/image)'}
            </button>
            {form.lease_doc && <span className="hint" style={{ color: 'var(--green)' }}>Attached — tenants can download it.</span>}
          </div>
        </Row>

        {!isNew && (
          <Row>
            <Select label="Rent status" value={form.status} onChange={set('status')}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Select label="Account status" value={form.account_status} onChange={set('account_status')}>
              {ACCOUNT_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </Select>
          </Row>
        )}

        {isNew && (
          <p className="hint" style={{ marginTop: 4 }}>
            A temporary password (TEMP-XXXX) is generated automatically. You’ll get a WhatsApp link to send the
            login details to the tenant.
          </p>
        )}
      </form>
    </Modal>
  )
}
