import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getPublicListing } from '../../lib/publicListings.js'
import { money } from '../../lib/format.js'
import { amenityLabel } from '../../lib/propertyOptions.js'
import { Spinner, EmptyState } from '../../components/ui.jsx'
import { IconWhatsapp, IconShare } from '../../components/icons.jsx'
import { PUB_CSS } from './Listings.jsx'

// One advertised property — a public, shareable page. This is the URL a manager
// pastes into WhatsApp groups, Facebook, or a portal's posting form.
export default function PublicListing() {
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [p, setP] = useState(null)
  const [photo, setPhoto] = useState(0)

  useEffect(() => {
    let alive = true
    getPublicListing(id)
      .then((row) => { if (alive) { setP(row); document.title = `${row.name} — RentLoja` } })
      .catch((e) => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [id])

  const share = async () => {
    const url = window.location.href
    const title = p ? `${p.name} — for rent on RentLoja` : 'Rental on RentLoja'
    if (navigator.share) { try { await navigator.share({ title, url }); return } catch { /* cancelled */ } }
    try { await navigator.clipboard.writeText(url); alert('Link copied — paste it anywhere.') } catch { /* ignore */ }
  }

  // Enquire on WhatsApp, pre-filled. Digits only; wa.me needs no plus.
  const enquire = () => {
    const num = String(p.ad_contact_phone || '').replace(/\D/g, '')
    const text = encodeURIComponent(`Hi, I saw "${p.name}" for rent on RentLoja and I'm interested. Is it still available?`)
    window.open(`https://wa.me/${num}?text=${text}`, '_blank', 'noopener')
  }

  if (loading) return <div className="pub"><div className="center" style={{ minHeight: '60vh' }}><Spinner /></div><style>{PUB_CSS}</style></div>
  if (error || !p) {
    return (
      <div className="pub">
        <div className="pub-wrap"><div className="card pad">
          <EmptyState icon="🔍" title="Listing not available">This place may have been rented or taken down.</EmptyState>
          <div className="center" style={{ marginTop: 12 }}><Link to="/rent" className="btn primary sm">Browse other rentals</Link></div>
        </div></div>
        <style>{PUB_CSS}</style>
      </div>
    )
  }

  const photos = Array.isArray(p.photos) ? p.photos : []
  const amenities = Array.isArray(p.amenities) ? p.amenities : []
  const utilities = Array.isArray(p.utilities_included) ? p.utilities_included : []
  const specs = [
    p.bedrooms != null && [`${p.bedrooms}`, 'Bedrooms'],
    p.bathrooms != null && [`${p.bathrooms}`, 'Bathrooms'],
    p.lounges != null && [`${p.lounges}`, 'Lounges'],
    p.floor_size != null && [`${p.floor_size} m²`, 'Floor size'],
    p.stand_size != null && [`${p.stand_size} m²`, 'Stand size'],
    p.furnished && [p.furnished, 'Furnishing'],
    p.max_occupants != null && [`${p.max_occupants}`, 'Max occupants'],
    p.year_built != null && [`${p.year_built}`, 'Year built'],
  ].filter(Boolean)

  return (
    <div className="pub">
      <header className="pub-top">
        <Link to="/rent" className="pub-brand">RentLoja</Link>
        <button className="btn ghost sm" onClick={share}><IconShare size={14} /> Share</button>
      </header>

      <div className="pub-wrap pub-listing">
        {photos.length > 0 ? (
          <div className="pl-gallery">
            <img src={photos[photo]} alt={p.name} className="pl-main" />
            {photos.length > 1 && (
              <div className="pl-thumbs">
                {photos.map((src, i) => (
                  <button key={i} className={`pl-thumb ${i === photo ? 'on' : ''}`} onClick={() => setPhoto(i)}>
                    <img src={src} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : <div className="pl-noimg">🏠</div>}

        <div className="pl-head">
          <div style={{ minWidth: 0 }}>
            <h1>{p.name}</h1>
            <div className="muted">{[p.suburb, p.city, p.province].filter(Boolean).join(', ') || p.location}</div>
            {p.type && <span className="pill neutral" style={{ marginTop: 8 }}>{p.type}</span>}
          </div>
          {p.ad_rent != null && (
            <div className="pl-price">
              <div className="pl-price-amt">{money(p.ad_rent)}{p.ad_currency && p.ad_currency !== 'USD' ? ` ${p.ad_currency}` : ''}</div>
              <div className="muted" style={{ fontSize: '0.8rem' }}>per month</div>
            </div>
          )}
        </div>

        {specs.length > 0 && (
          <div className="pl-specs">
            {specs.map(([v, label]) => (
              <div key={label} className="pl-spec"><div className="pl-spec-v">{v}</div><div className="muted">{label}</div></div>
            ))}
          </div>
        )}

        {p.description && (
          <section className="pl-sec"><h3>About this place</h3><p className="pl-desc">{p.description}</p></section>
        )}

        {amenities.length > 0 && (
          <section className="pl-sec">
            <h3>Amenities</h3>
            <div className="pl-chips">{amenities.map((a) => <span key={a} className="pl-chip">{amenityLabel(a)}</span>)}</div>
          </section>
        )}

        {(p.deposit != null || p.available_from || p.levy_fee != null || utilities.length > 0) && (
          <section className="pl-sec">
            <h3>Rental terms</h3>
            <div className="pl-terms">
              {p.deposit != null && <div><span className="muted">Deposit</span><b>{money(p.deposit)}</b></div>}
              {p.levy_fee != null && <div><span className="muted">Levy</span><b>{money(p.levy_fee)}</b></div>}
              {p.available_from && <div><span className="muted">Available from</span><b>{new Date(p.available_from).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</b></div>}
              {utilities.length > 0 && <div><span className="muted">Utilities included</span><b>{utilities.join(', ')}</b></div>}
            </div>
          </section>
        )}

        {p.rules && (
          <section className="pl-sec"><h3>House rules</h3><p className="pl-desc">{p.rules}</p></section>
        )}

        {p.map_link && (
          <section className="pl-sec"><a href={p.map_link} target="_blank" rel="noopener noreferrer" className="btn ghost sm">📍 View on map</a></section>
        )}
      </div>

      {/* Sticky enquire bar — the whole point of the page. */}
      <div className="pl-bar">
        <div className="pl-bar-in">
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
            {p.ad_rent != null && <div className="muted" style={{ fontSize: '0.82rem' }}>{money(p.ad_rent)}/mo · {p.ad_contact_name || 'Property manager'}</div>}
          </div>
          {p.ad_contact_phone
            ? <button className="btn wa" onClick={enquire}><IconWhatsapp size={16} /> Enquire</button>
            : <button className="btn ghost" onClick={share}><IconShare size={15} /> Share</button>}
        </div>
      </div>

      <style>{PUB_CSS}{LISTING_CSS}</style>
    </div>
  )
}

const LISTING_CSS = `
  .pub-listing { padding-bottom: 96px; max-width: 860px; }
  .pl-gallery { margin-bottom: 20px; }
  .pl-main { width: 100%; height: min(440px, 56vw); object-fit: cover; border-radius: var(--radius-lg); display: block; background: var(--surface-2); }
  .pl-thumbs { display: flex; gap: 8px; margin-top: 8px; overflow-x: auto; padding-bottom: 4px; }
  .pl-thumb { flex: 0 0 auto; width: 76px; height: 56px; border-radius: 9px; overflow: hidden; border: 2px solid transparent; padding: 0; background: none; }
  .pl-thumb.on { border-color: var(--accent); }
  .pl-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .pl-noimg { height: 220px; display: grid; place-items: center; font-size: 3rem; opacity: .35; background: var(--surface-2); border-radius: var(--radius-lg); margin-bottom: 20px; }
  .pl-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .pl-head h1 { font-size: 1.7rem; margin: 0; }
  .pl-price { text-align: right; flex-shrink: 0; }
  .pl-price-amt { font-size: 1.5rem; font-weight: 800; color: var(--accent-soft); }
  .pl-specs { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 10px; margin: 22px 0; }
  .pl-spec { border: 1px solid var(--line); border-radius: var(--radius); padding: 12px; text-align: center; }
  .pl-spec-v { font-weight: 700; font-size: 1.05rem; }
  .pl-spec .muted { font-size: 0.76rem; margin-top: 2px; }
  .pl-sec { margin: 22px 0; }
  .pl-sec h3 { font-size: 1.1rem; margin-bottom: 10px; }
  .pl-desc { white-space: pre-wrap; line-height: 1.6; color: var(--text-dim); }
  .pl-chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .pl-chip { font-size: 0.82rem; background: var(--surface-2); border: 1px solid var(--line); border-radius: 99px; padding: 5px 12px; }
  .pl-terms { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
  .pl-terms > div { display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--line-soft); border-radius: var(--radius); padding: 11px 13px; }
  .pl-bar { position: fixed; left: 0; right: 0; bottom: 0; background: var(--surface); border-top: 1px solid var(--line); z-index: 40; }
  .pl-bar-in { max-width: 860px; margin: 0 auto; padding: 12px 22px; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
`
