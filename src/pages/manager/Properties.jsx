import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { fileToProof } from '../../lib/upload.js'
import { toInternational } from '../../lib/phone.js'
import { PROPERTY_TYPES, FURNISHED, UTILITIES_INCLUDED, AMENITY_GROUPS } from '../../lib/propertyOptions.js'
import Modal from '../../components/Modal.jsx'
import { Input, Textarea, Select, Row } from '../../components/Field.jsx'
import { Spinner, EmptyState } from '../../components/ui.jsx'
import { IconPlus, IconBuilding, IconEdit, IconTrash, IconUsers, IconArrowRight } from '../../components/icons.jsx'

export default function Properties() {
  const { userId } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [props, setProps] = useState([])
  const [tenants, setTenants] = useState([])
  const [editing, setEditing] = useState(null) // property | {} (new) | null

  const load = async () => {
    const [p, t] = await Promise.all([db.listProperties(userId), db.listTenants(userId)])
    setProps(p); setTenants(t); setLoading(false)
  }
  useEffect(() => { load() }, [userId])

  const occupancyOf = (prop) => {
    const ts = tenants.filter((t) => t.property_id === prop.id && t.account_status !== 'suspended')
    if (ts.length === 0) return { cls: 'neutral', label: 'Vacant', count: 0 }
    const allPaid = ts.every((t) => t.status === 'paid')
    if (allPaid) return { cls: 'ok', label: 'All Paid', count: ts.length }
    return { cls: 'due', label: 'Partial', count: ts.length }
  }

  const remove = async (p) => {
    if (!confirm(`Delete "${p.name}"? Tenants will be unassigned.`)) return
    await db.deleteProperty(p.id)
    toast.success('Property deleted')
    load()
  }

  return (
    <div className="page">
      <div className="spread page-head">
        <div>
          <div className="eyebrow">Portfolio</div>
          <h1>Properties</h1>
          <p>Manage your buildings and units.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing({})}><IconPlus size={16} /> Add property</button>
      </div>

      {loading ? <div className="center" style={{ minHeight: 200 }}><Spinner /></div>
        : props.length === 0 ? (
          <div className="card"><EmptyState icon="🏢" title="No properties yet">Add your first property to start adding tenants.</EmptyState></div>
        ) : (
          <div className="grid cards">
            {props.map((p) => {
              const occ = occupancyOf(p)
              return (
                <div key={p.id} className="card pad clickable" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
                  role="button" tabIndex={0}
                  onClick={() => nav(`/manager/properties/${p.id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter') nav(`/manager/properties/${p.id}`) }}>
                  {p.photos?.length > 0 && <img className="prop-cover" src={p.photos[0]} alt={p.name} />}
                  <div className="spread">
                    <div className="row gap">
                      {!p.photos?.length && (
                        <div style={{ width: 42, height: 42, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--gold-bg)', border: '1px solid var(--gold-line)', color: 'var(--gold)' }}>
                          <IconBuilding size={20} />
                        </div>
                      )}
                      <div>
                        <h3 style={{ fontSize: '1.2rem' }}>{p.name}</h3>
                        <div className="muted" style={{ fontSize: '0.82rem' }}>{p.location || '—'}</div>
                      </div>
                    </div>
                    <div className="col" style={{ gap: 6, alignItems: 'flex-end' }}>
                      <span className={`pill ${occ.cls}`}><span className="dot" />{occ.label}</span>
                      {p.is_advertised && <span className="pill green">For rent</span>}
                    </div>
                  </div>

                  <div className="row wrap" style={{ gap: 14, fontSize: '0.84rem' }}>
                    <span className="muted">{p.type || '—'}</span>
                    {(p.bedrooms != null || p.bathrooms != null) && (
                      <span className="muted">{p.bedrooms ?? '—'} bed · {p.bathrooms ?? '—'} bath</span>
                    )}
                    <span className="row gap muted"><IconUsers size={14} /> {occ.count}/{p.units} units</span>
                  </div>

                  <div className="spread" style={{ marginTop: 'auto' }}>
                    <div className="row gap">
                      <button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); setEditing(p) }}><IconEdit size={14} /> Edit</button>
                      <button className="btn sm ghost danger" onClick={(e) => { e.stopPropagation(); remove(p) }}><IconTrash size={14} /></button>
                    </div>
                    <span className="row gap" style={{ color: 'var(--accent)', fontSize: '0.82rem', fontWeight: 600 }}>Open <IconArrowRight size={14} /></span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

      {editing && (
        <PropertyModal property={editing} userId={userId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }} />
      )}
    </div>
  )
}

const num = (v) => (v === '' || v == null ? null : Number(v))

export function PropertyModal({ property, userId, onClose, onSaved }) {
  const toast = useToast()
  const isNew = !property.id
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const [form, setForm] = useState({
    name: property.name || '', location: property.location || '',
    units: property.units || 1, type: property.type || PROPERTY_TYPES[0],
    photos: property.photos || [],
    address: property.address || '', suburb: property.suburb || '', city: property.city || '', province: property.province || '', map_link: property.map_link || '',
    bedrooms: property.bedrooms ?? '', bathrooms: property.bathrooms ?? '', lounges: property.lounges ?? '',
    floor_size: property.floor_size ?? '', stand_size: property.stand_size ?? '', furnished: property.furnished || FURNISHED[0],
    year_built: property.year_built ?? '', storeys: property.storeys ?? '',
    amenities: property.amenities || [],
    deposit: property.deposit ?? '', available_from: property.available_from || '', utilities_included: property.utilities_included || [], max_occupants: property.max_occupants ?? '', levy_fee: property.levy_fee ?? '',
    description: property.description || '', rules: property.rules || '',
    caretaker_name: property.caretaker_name || '', caretaker_phone: property.caretaker_phone || '',
    is_advertised: property.is_advertised || false,
    ad_rent: property.ad_rent != null && property.ad_rent !== '' ? String(Math.round(Number(property.ad_rent))) : '', ad_currency: property.ad_currency || 'USD',
    ad_contact_name: property.ad_contact_name || '', ad_contact_phone: property.ad_contact_phone || '',
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const toggleArr = (k, v) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }))

  const onPhotos = async (e) => {
    const files = [...(e.target.files || [])]
    for (const file of files) {
      try { const p = await fileToProof(file); setForm((f) => ({ ...f, photos: [...f.photos, p.url] })) }
      catch (err) { toast.error('Upload failed', err.message) }
    }
    e.target.value = ''
  }
  const removePhoto = (i) => setForm((f) => ({ ...f, photos: f.photos.filter((_, idx) => idx !== i) }))
  const makeCover = (i) => setForm((f) => { const p = [...f.photos]; const [img] = p.splice(i, 1); return { ...f, photos: [img, ...p] } })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const payload = {
        ...form,
        units: Number(form.units) || 0,
        bedrooms: num(form.bedrooms), bathrooms: num(form.bathrooms), lounges: num(form.lounges),
        floor_size: num(form.floor_size), stand_size: num(form.stand_size),
        year_built: num(form.year_built), storeys: num(form.storeys),
        deposit: num(form.deposit), max_occupants: num(form.max_occupants), levy_fee: num(form.levy_fee),
        available_from: form.available_from || null,
        ad_rent: num(form.ad_rent),
        // Normalise the public enquiry number to +263… so the wa.me link on the
        // listing works regardless of how the manager typed it.
        ad_contact_phone: form.ad_contact_phone ? toInternational(form.ad_contact_phone) : null,
        ad_contact_name: form.ad_contact_name || null,
      }
      if (isNew) await db.createProperty(userId, payload)
      else await db.updateProperty(property.id, payload)
      toast.success(isNew ? 'Property added' : 'Property updated')
      onSaved()
    } catch (err) { toast.error('Could not save', err.message); setBusy(false) }
  }

  return (
    <Modal wide title={isNew ? 'Add property' : `Edit ${property.name}`} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" form="prop-form" disabled={busy}>{busy ? 'Saving…' : 'Save property'}</button>
      </>}>
      <form id="prop-form" onSubmit={submit}>
        {/* Basics */}
        <Input label="Property name" value={form.name} onChange={set('name')} required autoFocus placeholder="e.g. Avondale Heights" />
        <Row>
          <Input label="Number of units" type="number" min="0" value={form.units} onChange={set('units')} required />
          <Select label="Type" value={form.type} onChange={set('type')}>{PROPERTY_TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
        </Row>

        {/* Photos */}
        <div className="field">
          <label>Photos <span className="muted">(first is the cover)</span></label>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPhotos} style={{ display: 'none' }} />
          <div className="photo-grid">
            {form.photos.map((src, i) => (
              <div key={i} className={`photo-thumb ${i === 0 ? 'cover' : ''}`}>
                <img src={src} alt="" />
                {i === 0 && <span className="cover-tag">Cover</span>}
                <div className="photo-actions">
                  {i !== 0 && <button type="button" title="Make cover" onClick={() => makeCover(i)}>★</button>}
                  <button type="button" title="Remove" onClick={() => removePhoto(i)}>✕</button>
                </div>
              </div>
            ))}
            <button type="button" className="photo-add" onClick={() => fileRef.current?.click()}><IconPlus size={18} /><span>Add photos</span></button>
          </div>
        </div>

        {/* Location */}
        <Section title="Location" />
        <Input label="Street address" value={form.address} onChange={set('address')} placeholder="e.g. 12 King George Road" />
        <Row>
          <Input label="Suburb / area" value={form.suburb} onChange={set('suburb')} placeholder="e.g. Avondale" />
          <Input label="City" value={form.city} onChange={set('city')} placeholder="e.g. Harare" />
        </Row>
        <Row>
          <Input label="Province" value={form.province} onChange={set('province')} placeholder="e.g. Harare" />
          <Input label="Google Maps / GPS link" value={form.map_link} onChange={set('map_link')} placeholder="https://maps.google.com/?q=…" />
        </Row>

        {/* Layout */}
        <Section title="Layout & rooms" />
        <Row>
          <Input label="Bedrooms" type="number" min="0" value={form.bedrooms} onChange={set('bedrooms')} />
          <Input label="Bathrooms" type="number" min="0" step="0.5" value={form.bathrooms} onChange={set('bathrooms')} />
        </Row>
        <Row>
          <Input label="Lounges / living rooms" type="number" min="0" value={form.lounges} onChange={set('lounges')} />
          <Select label="Furnished" value={form.furnished} onChange={set('furnished')}>{FURNISHED.map((f) => <option key={f}>{f}</option>)}</Select>
        </Row>
        <Row>
          <Input label="Floor size (m²)" type="number" min="0" value={form.floor_size} onChange={set('floor_size')} />
          <Input label="Stand / erf size (m²)" type="number" min="0" value={form.stand_size} onChange={set('stand_size')} />
        </Row>
        <Row>
          <Input label="Year built" type="number" min="1900" value={form.year_built} onChange={set('year_built')} />
          <Input label="Storeys" type="number" min="1" value={form.storeys} onChange={set('storeys')} />
        </Row>

        {/* Amenities */}
        <Section title="Amenities & features" />
        {AMENITY_GROUPS.map((g) => (
          <div className="field" key={g.group}>
            <label>{g.group}</label>
            <div className="chip-wrap">
              {g.items.map(([key, lbl]) => (
                <label key={key} className={`chip-toggle ${form.amenities.includes(key) ? 'on' : ''}`}>
                  <input type="checkbox" checked={form.amenities.includes(key)} onChange={() => toggleArr('amenities', key)} />{lbl}
                </label>
              ))}
            </div>
          </div>
        ))}

        {/* Terms */}
        <Section title="Rental terms" />
        <Row>
          <Input label="Rent / month (USD)" type="number" min="0" step="1" value={form.ad_rent}
            onChange={(e) => setForm((f) => ({ ...f, ad_rent: e.target.value.replace(/\D/g, '') }))}
            hint="Default rent for tenants added here — and the price shown if you advertise this property." />
          <Input label="Deposit (USD)" type="number" min="0" step="0.01" value={form.deposit} onChange={set('deposit')} />
        </Row>
        <Row>
          <Input label="Available from" type="date" value={form.available_from || ''} onChange={set('available_from')} />
          <Input label="Max occupants" type="number" min="0" value={form.max_occupants} onChange={set('max_occupants')} />
        </Row>
        <Row>
          <Input label="Monthly levy / service fee (USD)" type="number" min="0" step="0.01" value={form.levy_fee} onChange={set('levy_fee')} />
        </Row>
        <div className="field">
          <label>Utilities included in rent</label>
          <div className="chip-wrap">
            {UTILITIES_INCLUDED.map((u) => (
              <label key={u} className={`chip-toggle ${form.utilities_included.includes(u) ? 'on' : ''}`}>
                <input type="checkbox" checked={form.utilities_included.includes(u)} onChange={() => toggleArr('utilities_included', u)} />{u}
              </label>
            ))}
          </div>
        </div>

        {/* Notes & contact */}
        <Section title="Description & contact" />
        <Textarea label="Description" value={form.description} onChange={set('description')} placeholder="Tell prospective tenants about the property…" />
        <Textarea label="House rules" value={form.rules} onChange={set('rules')} placeholder="e.g. No subletting. Pets with deposit." />
        <Row>
          <Input label="Caretaker name" value={form.caretaker_name} onChange={set('caretaker_name')} />
          <Input label="Caretaker phone" type="tel" value={form.caretaker_phone} onChange={set('caretaker_phone')} placeholder="0772 000 111" />
        </Row>

        {/* Advertise */}
        <label className="spread" style={{ marginTop: 8, padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 'var(--radius)', background: form.is_advertised ? 'var(--accent-bg)' : 'var(--bg)', cursor: 'pointer' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>Advertise as available for rent</div>
            <div className="muted" style={{ fontSize: '0.78rem' }}>Shows a “For rent” badge and lets you share a ready-made listing.</div>
          </div>
          <span className="switch">
            <input type="checkbox" checked={form.is_advertised} onChange={() => setForm((f) => ({ ...f, is_advertised: !f.is_advertised }))} />
            <span className="track" />
          </span>
        </label>

        {/* Public-listing details — only relevant, and only shown, once it's
            being advertised. The contact number is the ONLY thing that becomes
            public; it's separate so the manager chooses it deliberately. */}
        {form.is_advertised && (
          <div style={{ marginTop: 10, padding: '14px', border: '1px solid var(--accent-line)', borderRadius: 'var(--radius)', background: 'var(--accent-bg)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 4 }}>Public listing details</div>
            <div className="muted" style={{ fontSize: '0.78rem', marginBottom: 12 }}>
              Shown on your shareable rentloja.com/rent page. Tenants’ details are never included.
            </div>
            <div className="field" style={{ marginBottom: 10, maxWidth: 160 }}>
              <label>Listing currency</label>
              <select className="select" value={form.ad_currency} onChange={set('ad_currency')}>
                <option value="USD">USD</option><option value="ZWG">ZWG</option>
              </select>
              <span className="hint">The listing shows the <b>Rent / month</b> you set under Rental terms above.</span>
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Enquiries WhatsApp number <span className="muted" style={{ fontWeight: 400 }}>· shown publicly</span></label>
              <input className="input" inputMode="tel" placeholder="e.g. 0771 234 567" value={form.ad_contact_phone}
                onChange={(e) => setForm((f) => ({ ...f, ad_contact_phone: e.target.value }))} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Contact name <span className="muted" style={{ fontWeight: 400 }}>· optional</span></label>
              <input className="input" placeholder="Who renters will be talking to" value={form.ad_contact_name}
                onChange={set('ad_contact_name')} />
            </div>
          </div>
        )}
      </form>
    </Modal>
  )
}

function Section({ title }) {
  return <div style={{ margin: '18px 0 10px', fontFamily: 'var(--serif)', fontSize: '1.1rem', fontWeight: 600, borderTop: '1px solid var(--line-soft)', paddingTop: 16 }}>{title}</div>
}
