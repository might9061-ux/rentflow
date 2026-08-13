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
  // Free-form extra details — whatever the manager wants to keep on record
  // (National ID, passport, student number, next of kin…), as label/value rows.
  const [extras, setExtras] = useState(() =>
    Object.entries(tenant?.details || {}).map(([k, v]) => ({ k, v: String(v) })))
  const setExtra = (i, field, value) => setExtras((xs) => xs.map((x, idx) => (idx === i ? { ...x, [field]: value } : x)))
  const removeExtra = (i) => setExtras((xs) => xs.filter((_, idx) => idx !== i))
  const fileRef = useRef(null)

  // Tenants are placed in one of the property's real houses/units, picked from a
  // fixed list — no free-text, so no phantom dwelling outside the list is created.
  const selectedProp = properties.find((p) => p.id === form.property_id)
  const slots = unitSlots(selectedProp)
  const noun = dwellingNoun(selectedProp?.type)          // 'House' | 'Unit'
  const nounLower = noun.toLowerCase()
  const unitLabel = noun === 'House' ? 'House number' : 'Unit'
  // Shared accommodation: roommates may share a unit, so occupied units stay
  // selectable and adding a co-tenant is allowed.
  const isShared = !!selectedProp?.shared
  // Max roommates per shared unit (0 = no limit).
  const capacity = Number(selectedProp?.shared_capacity) || 0
  // How many OTHER tenants are in each unit of the selected property.
  const unitCounts = {}
  tenants.forEach((t) => {
    if (t.property_id === form.property_id && t.id !== tenant?.id && t.unit) unitCounts[String(t.unit)] = (unitCounts[String(t.unit)] || 0) + 1
  })
  // A slot is "full" when it can take no more tenants: a non-shared unit at 1, or
  // a shared unit at its capacity.
  const slotFull = (s) => isShared ? (capacity > 0 && (unitCounts[s] || 0) >= capacity) : ((unitCounts[s] || 0) >= 1 && s !== tenant?.unit)
  const availableCount = slots.filter((s) => !slotFull(s)).length
  // When editing, keep the tenant's current dwelling selectable even if it now
  // falls outside the list (e.g. the count was lowered), so saving never wipes it.
  const unitOptions = tenant?.unit && !slots.includes(tenant.unit) ? [...slots, tenant.unit] : slots

  // Who (if anyone) already lives in the unit that's picked/typed — covers both
  // the dropdown and the free-text custom label, and ignores this same tenant.
  const occupant = form.unit
    ? tenants.find((t) => t.property_id === form.property_id && t.id !== tenant?.id && String(t.unit) === String(form.unit))
    : null
  const pickedCount = unitCounts[String(form.unit)] || 0
  // Picked unit is full (shared and at capacity) → block like an occupied unit.
  const isFull = !!form.unit && isShared && capacity > 0 && pickedCount >= capacity && form.unit !== tenant?.unit

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
    if (occupant && !isShared) return toast.error(`${noun} already occupied`, `${form.unit} is taken by ${fullName(occupant)}. Choose a different ${nounLower}.`)
    if (isFull) return toast.error(`${noun} is full`, `${form.unit} already has its ${capacity} roommate${capacity > 1 ? 's' : ''}. Choose a different ${nounLower}.`)
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
        // Extra details → {label: value}, skipping rows with an empty label.
        details: Object.fromEntries(extras.filter((x) => x.k.trim()).map((x) => [x.k.trim(), x.v.trim()])),
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
              hint={isShared ? `Shared${capacity ? ` · up to ${capacity} per ${nounLower}` : ''} — roommates can share a ${nounLower}` : (slots.length > 0 ? `${availableCount} of ${slots.length} ${nounLower}${slots.length > 1 ? 's' : ''} free` : undefined)}>
              <option value="">— Select a {nounLower} —</option>
              {unitOptions.map((s) => {
                const cnt = unitCounts[s] || 0
                const full = slotFull(s)
                const label = isShared
                  ? (cnt > 0 ? ` — ${cnt}${capacity ? '/' + capacity : ''} sharing${full ? ' · full' : ''}` : '')
                  : (full ? ' — occupied' : '')
                return <option key={s} value={s} disabled={full}>{s}{label}</option>
              })}
            </Select>
          ) : (
            <Field label={unitLabel} hint={selectedProp ? `Set this property’s number of ${nounLower}s to assign one.` : 'Assign a property first.'}>
              <input className="input" value="" disabled placeholder="—" />
            </Field>
          )}
        </Row>
        {isFull && (
          <div className="hint" style={{ color: 'var(--danger)', marginTop: -8, marginBottom: 12, fontWeight: 500 }}>
            ⚠ {form.unit} is full — it already has its {capacity} roommate{capacity > 1 ? 's' : ''}. Choose a different {nounLower}.
          </div>
        )}
        {occupant && isShared && !isFull && (
          <div className="hint" style={{ color: 'var(--text-dim)', marginTop: -8, marginBottom: 12, fontWeight: 500 }}>
            🤝 Shared {nounLower} — {form.unit} has {pickedCount} roommate{pickedCount > 1 ? 's' : ''}{capacity ? ` of ${capacity}` : ''} (incl. {fullName(occupant)}). This tenant joins as a co-tenant.
          </div>
        )}
        {occupant && !isShared && (
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

        {/* Free-form extra details — the manager decides what to keep on record. */}
        <div className="field" style={{ marginBottom: 6 }}>
          <label>Extra details <span className="muted" style={{ fontWeight: 400 }}>(optional — ID, passport, next of kin…)</span></label>
        </div>
        {extras.map((x, i) => (
          <div key={i} className="row gap" style={{ marginBottom: 8, alignItems: 'center' }}>
            <input className="input" style={{ flex: 1 }} placeholder="Label — e.g. National ID"
              value={x.k} onChange={(e) => setExtra(i, 'k', e.target.value)} />
            <input className="input" style={{ flex: 1.4 }} placeholder="Value — e.g. 63-123456A70"
              value={x.v} onChange={(e) => setExtra(i, 'v', e.target.value)} />
            <button type="button" className="btn sm ghost danger" title="Remove" onClick={() => removeExtra(i)}>✕</button>
          </div>
        ))}
        <button type="button" className="btn ghost sm" style={{ marginBottom: 14 }}
          onClick={() => setExtras((xs) => [...xs, { k: '', v: '' }])}>
          + Add detail
        </button>

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
