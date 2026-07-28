import { useState, useRef } from 'react'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { fileToProof } from '../../lib/upload.js'
import { isValidEmail, fullName } from '../../lib/format.js'
import Modal from '../../components/Modal.jsx'
import { Field, Input, EmailInput, Select, Row } from '../../components/Field.jsx'
import PhoneInput from '../../components/PhoneInput.jsx'
import { dwellingNoun, propertyUnitSlots } from '../../lib/propertyOptions.js'
import { IconReceipt } from '../../components/icons.jsx'

const STATUSES = ['pending', 'paid', 'due', 'overdue', 'inactive']
const ACCOUNT_STATUSES = ['pending_verification', 'active', 'suspended']

const unitSlots = propertyUnitSlots

// Add (new) or Edit (all fields incl. rent, unit, due_day, status, credit) a tenant.
export default function TenantModal({ tenant, properties, tenants = [], userId, onClose, onCreated, onUpdated }) {
  const toast = useToast()
  const isNew = !tenant?.id
  const [busy, setBusy] = useState(false)

  // A property's set price (its "Asking rent / month") is the rent a tenant on it
  // inherits — the manager set it once on the property, so there's no need to
  // retype it here. Blank when the property has no price set yet.
  const propRent = (prop) => (prop && prop.ad_rent != null && prop.ad_rent !== '' ? String(Math.round(Number(prop.ad_rent))) : '')
  const initialPropId = tenant?.property_id || (properties[0]?.id || '')

  const [form, setForm] = useState({
    first_name: tenant?.first_name || '', last_name: tenant?.last_name || '',
    email: tenant?.email || '', phone: tenant?.phone || '',
    property_id: initialPropId,
    unit: tenant?.unit || '', rent: tenant?.rent != null ? String(Math.round(Number(tenant.rent))) : propRent(properties.find((p) => p.id === initialPropId)), due_day: tenant?.due_day ?? 1,
    lease_start: tenant?.lease_start || '', lease_end: tenant?.lease_end || '', status: tenant?.status || 'pending',
    account_status: tenant?.account_status || 'pending_verification',
    lease_doc: tenant?.lease_doc || null, lease_doc_name: tenant?.lease_doc_name || null,
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const fileRef = useRef(null)

  // Tenants are placed in one of the property's real houses/units, picked from a
  // fixed list — no free-text, so no phantom dwelling outside the list is created.
  const selectedProp = properties.find((p) => p.id === form.property_id)
  const slots = unitSlots(selectedProp)
  const noun = dwellingNoun(selectedProp?.type)          // 'House' | 'Unit'
  const nounLower = noun.toLowerCase()
  const unitLabel = noun === 'House' ? 'House number' : 'Unit'
  // Units already occupied by OTHER tenants in the selected property.
  const takenUnits = new Set(
    tenants.filter((t) => t.property_id === form.property_id && t.id !== tenant?.id && t.unit).map((t) => String(t.unit)),
  )
  const availableCount = slots.filter((s) => !takenUnits.has(s)).length
  // When editing, keep the tenant's current dwelling selectable even if it now
  // falls outside the list (e.g. the count was lowered), so saving never wipes it.
  const unitOptions = tenant?.unit && !slots.includes(tenant.unit) ? [...slots, tenant.unit] : slots

  // Who (if anyone) already lives in the unit that's picked/typed — covers both
  // the dropdown and the free-text custom label, and ignores this same tenant.
  const occupant = form.unit
    ? tenants.find((t) => t.property_id === form.property_id && t.id !== tenant?.id && String(t.unit) === String(form.unit))
    : null

  const onPropertyChange = (e) => {
    const prop = properties.find((p) => p.id === e.target.value)
    const r = propRent(prop)
    // Follow the newly chosen property's price; keep the current figure only
    // when that property has no price set, so we never blank a real amount.
    setForm((f) => ({ ...f, property_id: e.target.value, unit: '', rent: r !== '' ? r : f.rent }))
  }

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
    if (occupant) return toast.error(`${noun} already occupied`, `${form.unit} is taken by ${fullName(occupant)}. Choose a different ${nounLower}.`)
    setBusy(true)
    try {
      const payload = {
        ...form,
        rent: Number(form.rent) || 0,
        due_day: Number(form.due_day) || 1,
            property_id: form.property_id || null,
        // Date columns reject "" — send null when a lease date is left blank.
        lease_start: form.lease_start || null,
        lease_end: form.lease_end || null,
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
          <Select label="Property" value={form.property_id} onChange={onPropertyChange}>
            <option value="">— Unassigned —</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          {unitOptions.length > 0 ? (
            <Select label={unitLabel} value={unitOptions.includes(form.unit) ? form.unit : ''} onChange={set('unit')}
              hint={slots.length > 0 ? `${availableCount} of ${slots.length} ${nounLower}${slots.length > 1 ? 's' : ''} free` : undefined}>
              <option value="">— Select a {nounLower} —</option>
              {unitOptions.map((s) => {
                const taken = takenUnits.has(s) && s !== tenant?.unit
                return <option key={s} value={s} disabled={taken}>{s}{taken ? ' — occupied' : ''}</option>
              })}
            </Select>
          ) : (
            <Field label={unitLabel} hint={selectedProp ? `Set this property’s number of ${nounLower}s to assign one.` : 'Assign a property first.'}>
              <input className="input" value="" disabled placeholder="—" />
            </Field>
          )}
        </Row>
        {occupant && (
          <div className="hint" style={{ color: 'var(--danger)', marginTop: -8, marginBottom: 12, fontWeight: 500 }}>
            ⚠ {form.unit} is already occupied by {fullName(occupant)} — choose a different {nounLower}.
          </div>
        )}
        <Row>
          <Input label="Monthly rent (USD)" type="number" min="0" step="1" value={form.rent}
            onChange={(e) => setForm((f) => ({ ...f, rent: e.target.value.replace(/\D/g, '') }))} required
            hint={selectedProp && propRent(selectedProp) !== '' ? 'From this property’s set price — edit if this unit differs.' : 'Tip: set the property’s rent to auto-fill this.'} />
          <Input label="Due day (1–31)" type="number" min="1" max="31" value={form.due_day} onChange={set('due_day')} required />
        </Row>
        <Row>
          <Input label="Lease start" type="date" value={form.lease_start || ''} onChange={set('lease_start')} />
          <Input label="Lease end" type="date" value={form.lease_end || ''} onChange={set('lease_end')} />
        </Row>
        <div className="field">
          <label>Lease document</label>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={onLeaseFile} style={{ display: 'none' }} />
          <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()} style={{ justifyContent: 'flex-start' }}>
            <IconReceipt size={15} /> {form.lease_doc ? (form.lease_doc_name || 'Replace document') : 'Upload lease (PDF/image)'}
          </button>
          {form.lease_doc && <span className="hint" style={{ color: 'var(--green)' }}>Attached — tenants can download it.</span>}
        </div>

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
