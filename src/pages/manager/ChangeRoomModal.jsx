import { useEffect, useState } from 'react'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { fullName } from '../../lib/format.js'
import Modal from '../../components/Modal.jsx'
import { Field, Input, Select } from '../../components/Field.jsx'
import { Spinner } from '../../components/ui.jsx'
import { dwellingNoun, propertyUnitSlots } from '../../lib/propertyOptions.js'

// Move a tenant to another room/unit in their property — the one-field version
// of Edit, with the same rules: occupied units are blocked, shared units
// respect their roommate capacity, and the current room stays selectable.
export default function ChangeRoomModal({ tenant, userId, onClose, onSaved }) {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState([])
  const [tenants, setTenants] = useState([])
  const [unit, setUnit] = useState(tenant.unit || '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    (async () => {
      const [ps, ts] = await Promise.all([db.listProperties(userId), db.listTenants(userId)])
      setProperties(ps); setTenants(ts); setLoading(false)
    })()
  }, [userId])

  const prop = properties.find((p) => p.id === tenant.property_id)
  const slots = propertyUnitSlots(prop)
  const noun = dwellingNoun(prop?.type)          // 'House' | 'Unit'
  const nounLower = noun.toLowerCase()
  const isShared = !!prop?.shared
  const capacity = Number(prop?.shared_capacity) || 0

  // How many OTHER tenants are in each unit of this property.
  const unitCounts = {}
  tenants.forEach((t) => {
    if (t.property_id === tenant.property_id && t.id !== tenant.id && t.unit) unitCounts[String(t.unit)] = (unitCounts[String(t.unit)] || 0) + 1
  })
  const slotFull = (s) => isShared ? (capacity > 0 && (unitCounts[s] || 0) >= capacity) : ((unitCounts[s] || 0) >= 1 && s !== tenant.unit)
  const options = tenant.unit && !slots.includes(tenant.unit) ? [...slots, tenant.unit] : slots

  const occupant = unit
    ? tenants.find((t) => t.property_id === tenant.property_id && t.id !== tenant.id && String(t.unit) === String(unit))
    : null
  const pickedCount = unitCounts[String(unit)] || 0
  const isFull = !!unit && isShared && capacity > 0 && pickedCount >= capacity && unit !== tenant.unit

  const save = async () => {
    if (!unit) return toast.error(`Pick a ${nounLower}`)
    if (unit === (tenant.unit || '')) return onClose()
    if (occupant && !isShared) return toast.error(`${noun} already occupied`, `${unit} is taken by ${fullName(occupant)}. Choose a different ${nounLower}.`)
    if (isFull) return toast.error(`${noun} is full`, `${unit} already has its ${capacity} roommate${capacity > 1 ? 's' : ''}. Choose a different ${nounLower}.`)
    setBusy(true)
    try {
      await db.updateTenant(tenant.id, { unit })
      toast.success(`${noun} changed`, `${fullName(tenant)} is now in ${unit}.`)
      onSaved()
    } catch (e) { toast.error(`Could not change ${nounLower}`, e.message); setBusy(false) }
  }

  return (
    <Modal title={`Change ${nounLower} — ${fullName(tenant)}`} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy || loading}>{busy ? 'Saving…' : 'Move tenant'}</button>
      </>}>
      {loading ? <div className="center" style={{ minHeight: 120 }}><Spinner /></div> : !prop ? (
        <p className="muted">This tenant has no property assigned yet — assign one under <b>Edit</b> first.</p>
      ) : (
        <>
          <p className="muted" style={{ marginBottom: 14, fontSize: '0.88rem' }}>
            {prop.name} · currently in <b style={{ color: 'var(--text)' }}>{tenant.unit || `no ${nounLower}`}</b>.
            Their rent, history and login stay exactly as they are — only the {nounLower} changes.
          </p>
          {options.length > 0 ? (
            <Select label={noun === 'House' ? 'New house number' : 'New unit'} value={options.includes(unit) ? unit : ''} onChange={(e) => setUnit(e.target.value)}>
              <option value="" disabled>Pick a {nounLower}…</option>
              {options.map((s) => {
                const cnt = unitCounts[s] || 0
                const label = s === tenant.unit ? `${s} · current`
                  : slotFull(s) ? `${s} · ${isShared ? 'full' : 'occupied'}`
                  : cnt > 0 ? `${s} · ${cnt} roommate${cnt > 1 ? 's' : ''}` : s
                return <option key={s} value={s} disabled={slotFull(s) && s !== tenant.unit}>{label}</option>
              })}
            </Select>
          ) : (
            <Field label={noun === 'House' ? 'New house number' : 'New unit'} hint={`Set this property’s number of ${nounLower}s to pick from a list.`}>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={`e.g. A${(unitCounts && Object.keys(unitCounts).length + 1) || 1}`} />
            </Field>
          )}
          {occupant && isShared && !isFull && unit !== tenant.unit && (
            <p className="hint" style={{ marginTop: 8 }}>
              🤝 Shared {nounLower} — they’ll join {fullName(occupant)}{pickedCount > 1 ? ` and ${pickedCount - 1} other${pickedCount > 2 ? 's' : ''}` : ''} as a co-tenant.
            </p>
          )}
        </>
      )}
    </Modal>
  )
}
