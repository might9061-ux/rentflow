import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { money, fullName, fmtDate } from '../../lib/format.js'
import { AMENITY_GROUPS, dwellingNoun, propertyUnitSlots } from '../../lib/propertyOptions.js'
import { tenantLedger } from '../../lib/ledger.js'
import { sendWhatsApp, listingMessage } from '../../lib/whatsapp.js'
import { StatusPill, Spinner, EmptyState } from '../../components/ui.jsx'
import { IconArrowRight, IconBuilding, IconUsers, IconEdit, IconWhatsapp, IconCheck, IconEye, IconShare } from '../../components/icons.jsx'
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
  const [moreMenu, setMoreMenu] = useState(false) // ⋯ menu for share/public-page actions

  useEffect(() => {
    if (!moreMenu) return
    const close = () => setMoreMenu(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [moreMenu])

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
  // Balance and the "All Paid / Partial" badge both come from the ledger, not
  // the stored status — a drifted status can't hide or invent what's owed.
  const owedBy = active.map((t) => tenantLedger(t, payments).totalOwed)
  const outstanding = owedBy.reduce((s, v) => s + v, 0)
  const occ = active.length === 0 ? { cls: 'neutral', label: 'Vacant' }
    : owedBy.every((v) => v <= 0.001) ? { cls: 'ok', label: 'All Paid' } : { cls: 'due', label: 'Partial' }
  // The property's dwellings (named or numbered) and how many sit empty.
  const slots = propertyUnitSlots(P)
  const noun = dwellingNoun(P.type)
  const vacantCount = slots.filter((s) => !active.some((t) => String(t.unit) === String(s))).length
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
        <div className="row gap" style={{ position: 'relative' }}>
          <button className="btn primary sm" onClick={() => setEditing(true)}><IconEdit size={14} /> Edit</button>
          {P.is_advertised && (
            <>
              {/* Listing/share actions live behind ⋯ to keep the toolbar clean. */}
              <button className="btn ghost sm" aria-label="More actions"
                onClick={(e) => { e.stopPropagation(); setMoreMenu((v) => !v) }}>⋯</button>
              {moreMenu && (
                <div className="pd-menu" onClick={(e) => e.stopPropagation()}>
                  <a href={publicUrl} target="_blank" rel="noopener noreferrer" onClick={() => setMoreMenu(false)}><IconEye size={13} /> View public page</a>
                  <button onClick={() => { setMoreMenu(false); copyLink() }}><IconShare size={13} /> Copy link</button>
                  <button onClick={() => { setMoreMenu(false); shareListing() }}><IconWhatsapp size={13} /> Share on WhatsApp</button>
                </div>
              )}
            </>
          )}
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

      {/* Compact KPI strip — four cells that never stack into tall cards. */}
      <div className="pd-kpis" style={{ marginBottom: 24 }}>
        <div><span className="pk-l">Occupancy</span><span className="pk-v">{P.units ? Math.round((active.length / P.units) * 100) : 0}%</span><span className="pk-s">{active.length} of {P.units} units</span></div>
        <div><span className="pk-l">Tenants</span><span className="pk-v">{tenants.length}</span><span className="pk-s">on this property</span></div>
        <div><span className="pk-l">Collected</span><span className="pk-v" style={{ color: collected > 0 ? 'var(--green)' : undefined }}>{money(collected)}</span><span className="pk-s">{approved.length} payments</span></div>
        <div><span className="pk-l">Owed</span><span className="pk-v" style={{ color: outstanding > 0 ? 'var(--danger)' : undefined }}>{money(outstanding)}</span><span className="pk-s">{outstanding > 0 ? 'unpaid balance' : 'nothing owed'}</span></div>
      </div>
      <style>{`
        .pd-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px;
          background: var(--line-soft); border: 1px solid var(--line-soft); border-radius: var(--radius); overflow: hidden; }
        .pd-kpis > div { background: var(--surface); padding: 12px 16px; }
        .pk-l { display: block; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-dim); }
        .pk-v { display: block; font-family: var(--serif); font-size: 1.35rem; font-weight: 600; margin-top: 3px; }
        .pk-s { display: block; font-size: 0.74rem; color: var(--text-faint); margin-top: 2px; }
        @media (max-width: 640px) { .pd-kpis { grid-template-columns: 1fr 1fr; } }
        .pd-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; min-width: 196px;
          background: var(--surface); border: 1px solid var(--line); border-radius: 10px;
          box-shadow: 0 10px 28px -12px rgba(13,27,46,0.35); padding: 5px; }
        .pd-menu button, .pd-menu a { display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 11px;
          background: none; border: none; border-radius: 7px; color: var(--text); font-size: 0.86rem;
          cursor: pointer; text-align: left; text-decoration: none; box-sizing: border-box; }
        .pd-menu button:hover, .pd-menu a:hover { background: var(--accent-bg); }
        .pd-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px;
          border-bottom: 1px solid var(--line-soft); transition: background 0.13s; }
        .pd-row:last-of-type { border-bottom: none; }
        .pd-row.click { cursor: pointer; }
        .pd-row.click:hover { background: var(--accent-bg); }
        .pd-dot { width: 9px; height: 9px; border-radius: 99px; flex-shrink: 0; }
        .pd-sub { font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      `}</style>

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

      {/* Units — executive rows. Tenants NOT linked to a unit get their own row,
          so the occupancy figure and this list can never silently disagree. */}
      {slots.length > 0 && (() => {
        const unassigned = active.filter((t) => !slots.some((s) => String(t.unit) === String(s)))
        return (
          <>
            <h3 style={{ marginBottom: 12 }}>
              {noun === 'House' ? 'Houses' : 'Units'}
              <span className="muted" style={{ fontWeight: 400, fontSize: '0.9rem' }}> · {slots.length - vacantCount} of {slots.length} assigned{unassigned.length ? ` · ${unassigned.length} tenant${unassigned.length === 1 ? '' : 's'} without a ${noun.toLowerCase()}` : ''}</span>
            </h3>
            <div className="card" style={{ marginBottom: 24 }}>
              {slots.map((slot) => {
                const occupants = active.filter((x) => String(x.unit) === String(slot))
                const t = occupants[0]
                const cap = P.shared ? (Number(P.shared_capacity) || 0) : 1
                return (
                  <div key={slot} className={`pd-row ${t ? 'click' : ''}`} role={t ? 'button' : undefined} tabIndex={t ? 0 : undefined}
                    onClick={t ? () => nav(`/manager/tenants/${t.id}`) : undefined}
                    onKeyDown={t ? (e) => { if (e.key === 'Enter') nav(`/manager/tenants/${t.id}`) } : undefined}>
                    <span className="pd-dot" style={{ background: occupants.length ? 'var(--green)' : 'var(--line)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600 }}>{slot}</span>
                      {occupants.length > 0 && <span className="muted"> · {occupants.map((o) => fullName(o)).join(', ')}</span>}
                      <div className="muted pd-sub">
                        {occupants.length === 0 ? 'Vacant — no tenant assigned'
                          : P.shared ? `${occupants.length}${cap ? ` of ${cap}` : ''} sharing`
                            : `rent ${money(t.rent)}/mo`}
                      </div>
                    </div>
                    {occupants.length > 0
                      ? (P.shared ? <span className="pill neutral">{occupants.length}{cap ? `/${cap}` : ''}</span> : <StatusPill status={t.status} />)
                      : <span className="pill neutral">Vacant</span>}
                    {t && <span style={{ color: 'var(--accent)', display: 'inline-flex' }}><IconArrowRight size={15} /></span>}
                  </div>
                )
              })}
              {unassigned.map((t) => (
                <div key={t.id} className="pd-row click" role="button" tabIndex={0}
                  onClick={() => nav(`/manager/tenants/${t.id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter') nav(`/manager/tenants/${t.id}`) }}>
                  <span className="pd-dot" style={{ background: 'var(--warn)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{fullName(t)}</span>
                    <span className="muted"> · no {noun.toLowerCase()} assigned</span>
                    <div className="muted pd-sub">rent {money(t.rent)}/mo · open and set their {noun === 'House' ? 'house' : 'unit'} under Edit</div>
                  </div>
                  <StatusPill status={t.status} />
                  <span style={{ color: 'var(--accent)', display: 'inline-flex' }}><IconArrowRight size={15} /></span>
                </div>
              ))}
            </div>
          </>
        )
      })()}

      {/* Tenants — executive rows */}
      <h3 style={{ marginBottom: 12 }}>Tenants</h3>
      {tenants.length === 0 ? (
        <div className="card" style={{ marginBottom: 24 }}><EmptyState icon="👤" title="No tenants here yet">Assign tenants to this property from the Tenants page.</EmptyState></div>
      ) : (
        <div className="card" style={{ marginBottom: 24 }}>
          {tenants.map((t) => (
            <div key={t.id} className="pd-row click" role="button" tabIndex={0}
              onClick={() => nav(`/manager/tenants/${t.id}`)}
              onKeyDown={(e) => { if (e.key === 'Enter') nav(`/manager/tenants/${t.id}`) }}>
              <span className="pd-dot" style={{ background: t.status === 'paid' ? 'var(--green)' : t.status === 'overdue' ? 'var(--danger)' : 'var(--warn)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{fullName(t)}</span>
                <div className="muted pd-sub">{noun === 'House' ? 'House' : 'Unit'} {t.unit || '—'} · {money(t.rent)}/mo</div>
              </div>
              <StatusPill status={t.status} />
              <span style={{ color: 'var(--accent)', display: 'inline-flex' }}><IconArrowRight size={15} /></span>
            </div>
          ))}
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
