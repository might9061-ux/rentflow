import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { money, fullName, fmtDate } from '../../lib/format.js'
import { AMENITY_GROUPS } from '../../lib/propertyOptions.js'
import { sendWhatsApp, listingMessage } from '../../lib/whatsapp.js'
import { StatCard, StatusPill, PeriodTag, Spinner, EmptyState } from '../../components/ui.jsx'
import { IconArrowRight, IconBuilding, IconUsers, IconWallet, IconClock, IconEdit, IconWhatsapp, IconCheck, IconEye, IconShare } from '../../components/icons.jsx'
import { PropertyModal } from './Properties.jsx'

export default function PropertyDetail() {
  const { id } = useParams()
  const { userId, profile } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [property, setProperty] = useState(null)
  const [tenants, setTenants] = useState([])
  const [payments, setPayments] = useState([])
  const [editing, setEditing] = useState(false)
  const [activePhoto, setActivePhoto] = useState(0)

  const load = async () => {
    const [props, t, p] = await Promise.all([db.listProperties(userId), db.listTenants(userId), db.listPayments(userId)])
    setProperty(props.find((x) => x.id === id) || null)
    setTenants(t.filter((x) => x.property_id === id))
    const ids = new Set(t.filter((x) => x.property_id === id).map((x) => x.id))
    setPayments(p.filter((x) => ids.has(x.tenant_id)))
    setLoading(false)
  }
  useEffect(() => { load() }, [id, userId])

  if (loading) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>
  if (!property) return <div className="page"><EmptyState icon="∅" title="Property not found" /></div>

  const P = property
  const active = tenants.filter((t) => t.account_status !== 'suspended')
  const approved = payments.filter((p) => p.status === 'approved')
  const collected = approved.reduce((s, p) => s + Number(p.amount), 0)
  const outstanding = active.filter((t) => t.status !== 'paid').reduce((s, t) => s + Math.max(0, Number(t.rent) - Number(t.credit_balance)), 0)
  const occ = active.length === 0 ? { cls: 'neutral', label: 'Vacant' }
    : active.every((t) => t.status === 'paid') ? { cls: 'ok', label: 'All Paid' } : { cls: 'due', label: 'Partial' }
  const fullAddress = [P.address, P.suburb, P.city, P.province].filter(Boolean).join(', ') || P.location
  const photos = P.photos || []

  const specs = [
    P.bedrooms != null && [`${P.bedrooms}`, 'Bedrooms'],
    P.bathrooms != null && [`${P.bathrooms}`, 'Bathrooms'],
    P.lounges != null && [`${P.lounges}`, 'Lounges'],
    P.floor_size != null && [`${P.floor_size} m²`, 'Floor size'],
    P.stand_size != null && [`${P.stand_size} m²`, 'Stand size'],
    P.furnished && [P.furnished, 'Furnishing'],
    P.year_built != null && [`${P.year_built}`, 'Year built'],
    P.storeys != null && [`${P.storeys}`, 'Storeys'],
  ].filter(Boolean)

  const publicUrl = `${window.location.origin}/rent/${P.id}`
  const shareListing = () => sendWhatsApp(null, listingMessage(P, profile, publicUrl))
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(publicUrl); toast.success('Link copied', 'Paste it into any group or portal.') }
    catch { toast.error('Could not copy', 'Long-press the link on the public page instead.') }
  }

  return (
    <div className="page">
      <div className="spread wrap" style={{ marginBottom: 16, gap: 10 }}>
        <button className="btn ghost sm" onClick={() => nav('/manager/properties')}>
          <IconArrowRight size={14} style={{ transform: 'rotate(180deg)' }} /> Properties
        </button>
        <div className="row gap">
          {P.is_advertised && <>
            <a className="btn ghost sm" href={publicUrl} target="_blank" rel="noopener noreferrer"><IconEye size={14} /> View public page</a>
            <button className="btn ghost sm" onClick={copyLink}><IconShare size={14} /> Copy link</button>
            <button className="btn wa sm" onClick={shareListing}><IconWhatsapp size={14} /> Share on WhatsApp</button>
          </>}
          <button className="btn primary sm" onClick={() => setEditing(true)}><IconEdit size={14} /> Edit</button>
        </div>
      </div>

      {/* Gallery */}
      {photos.length > 0 && (
        <div className="card" style={{ overflow: 'hidden', marginBottom: 20 }}>
          <img src={photos[activePhoto]} alt={P.name} style={{ width: '100%', height: 320, objectFit: 'cover', display: 'block' }} />
          {photos.length > 1 && (
            <div className="row gap" style={{ padding: 10, overflowX: 'auto' }}>
              {photos.map((src, i) => (
                <img key={i} src={src} alt="" onClick={() => setActivePhoto(i)}
                  style={{ width: 72, height: 54, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', flexShrink: 0, border: i === activePhoto ? '2px solid var(--accent)' : '1px solid var(--line)' }} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className="card pad" style={{ marginBottom: 20 }}>
        <div className="spread wrap" style={{ gap: 16 }}>
          <div className="row gap">
            <div style={{ width: 52, height: 52, borderRadius: 13, display: 'grid', placeItems: 'center', background: 'var(--gold-bg)', border: '1px solid var(--gold-line)', color: 'var(--gold)' }}>
              <IconBuilding size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.8rem' }}>{P.name}</h1>
              <div className="muted">{fullAddress || '—'}</div>
            </div>
          </div>
          {P.map_link && <a className="btn ghost" href={P.map_link} target="_blank" rel="noopener">📍 View on map</a>}
        </div>
        <div className="row gap wrap" style={{ marginTop: 16 }}>
          <span className={`pill ${occ.cls}`}><span className="dot" />{occ.label}</span>
          {P.is_advertised && <span className="pill green">For rent</span>}
          <span className="pill neutral">{P.type || '—'}</span>
          <span className="pill neutral"><IconUsers size={12} /> {active.length}/{P.units} units</span>
        </div>
        {P.description && <p className="muted" style={{ marginTop: 14, whiteSpace: 'pre-wrap' }}>{P.description}</p>}
      </div>

      {/* Stats */}
      <div className="grid stats" style={{ marginBottom: 24 }}>
        <StatCard label="Occupancy" value={`${P.units ? Math.round((active.length / P.units) * 100) : 0}%`} sub={`${active.length} of ${P.units} units`} icon={<IconBuilding size={18} />} />
        <StatCard label="Tenants" value={tenants.length} sub="On this property" icon={<IconUsers size={18} />} />
        <StatCard label="Collected" value={money(collected)} sub={`${approved.length} payments`} icon={<IconWallet size={18} />} />
        <StatCard label="Outstanding" value={money(outstanding)} sub="Unpaid tenants" icon={<IconClock size={18} />} />
      </div>

      {/* Specs + Amenities + Terms */}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', marginBottom: 24, alignItems: 'start' }}>
        {specs.length > 0 && (
          <div className="card pad">
            <h3 style={{ marginBottom: 12 }}>Layout & size</h3>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {specs.map(([v, l]) => (
                <div key={l}>
                  <div className="mono" style={{ fontFamily: 'var(--serif)', fontSize: '1.3rem', fontWeight: 600 }}>{v}</div>
                  <div className="muted" style={{ fontSize: '0.78rem' }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card pad">
          <h3 style={{ marginBottom: 12 }}>Rental terms</h3>
          <div className="col" style={{ gap: 9, fontSize: '0.88rem' }}>
            <TermRow label="Deposit" value={P.deposit != null ? money(P.deposit) : '—'} />
            <TermRow label="Available from" value={P.available_from ? fmtDate(P.available_from) : 'Now'} />
            <TermRow label="Levy / service fee" value={P.levy_fee != null ? `${money(P.levy_fee)}/mo` : '—'} />
            <TermRow label="Max occupants" value={P.max_occupants ?? '—'} />
            <TermRow label="Utilities included" value={(P.utilities_included || []).join(', ') || 'None'} />
            {P.caretaker_name && <TermRow label="Caretaker" value={`${P.caretaker_name}${P.caretaker_phone ? ` · ${P.caretaker_phone}` : ''}`} />}
          </div>
          {P.rules && <><div className="divider" /><div className="muted" style={{ fontSize: '0.84rem', whiteSpace: 'pre-wrap' }}><b style={{ color: 'var(--text)' }}>House rules:</b> {P.rules}</div></>}
        </div>
      </div>

      {/* Amenities */}
      {(P.amenities || []).length > 0 && (
        <div className="card pad" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 12 }}>Amenities & features</h3>
          <div className="col" style={{ gap: 12 }}>
            {AMENITY_GROUPS.map((g) => {
              const items = g.items.filter(([key]) => P.amenities.includes(key))
              if (items.length === 0) return null
              return (
                <div key={g.group}>
                  <div className="eyebrow" style={{ color: 'var(--accent)', marginBottom: 6 }}>{g.group}</div>
                  <div className="row gap wrap">
                    {items.map(([key, lbl]) => (
                      <span key={key} className="pill neutral"><IconCheck size={12} style={{ color: 'var(--green)' }} /> {lbl}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tenants */}
      <h3 style={{ marginBottom: 12 }}>Tenants</h3>
      {tenants.length === 0 ? (
        <div className="card" style={{ marginBottom: 24 }}><EmptyState icon="👤" title="No tenants here yet">Assign tenants to this property from the Tenants page.</EmptyState></div>
      ) : (
        <div className="table-wrap" style={{ marginBottom: 24 }}>
          <table className="data">
            <thead><tr><th>Tenant</th><th>Unit</th><th>Rent</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} className="clickable-row" onClick={() => nav(`/manager/tenants/${t.id}`)}>
                  <td style={{ fontWeight: 600 }}>{fullName(t)}</td>
                  <td>{t.unit || '—'}</td>
                  <td className="mono">{money(t.rent)}</td>
                  <td><StatusPill status={t.status} /></td>
                  <td style={{ textAlign: 'right', color: 'var(--accent)' }}><IconArrowRight size={15} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <PropertyModal property={property} userId={userId}
          onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load() }} />
      )}
    </div>
  )
}

function TermRow({ label, value }) {
  return <div className="spread"><span className="muted">{label}</span><b>{value}</b></div>
}
