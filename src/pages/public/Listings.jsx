import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listPublicListings } from '../../lib/publicListings.js'
import { money } from '../../lib/format.js'
import { Spinner, EmptyState } from '../../components/ui.jsx'

const norm = (s) => (s || '').trim()
const uniqSorted = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b))

// Public marketplace of advertised properties. No login — anyone can browse.
export default function PublicListings() {
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [all, setAll] = useState([])
  const [q, setQ] = useState('')
  const [province, setProvince] = useState('')
  const [city, setCity] = useState('')
  const [area, setArea] = useState('') // suburb / place within the city

  useEffect(() => { document.title = 'Rentals — RentLoja' }, [])
  useEffect(() => {
    let alive = true
    setLoading(true)
    listPublicListings()
      .then((rows) => { if (alive) { setAll(rows); setError(null) } })
      .catch((e) => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  // Location options, dependent: cities narrow to the chosen province, areas to
  // the chosen city — so every option always has at least one matching place.
  const provinces = useMemo(() => uniqSorted(all.map((p) => norm(p.province))), [all])
  const cities = useMemo(() => uniqSorted(
    all.filter((p) => !province || norm(p.province) === province).map((p) => norm(p.city)),
  ), [all, province])
  const areas = useMemo(() => uniqSorted(
    all.filter((p) => (!province || norm(p.province) === province) && (!city || norm(p.city) === city))
      .map((p) => norm(p.suburb)),
  ), [all, province, city])

  const items = useMemo(() => {
    const term = q.trim().toLowerCase()
    return all.filter((p) =>
      (!province || norm(p.province) === province) &&
      (!city || norm(p.city) === city) &&
      (!area || norm(p.suburb) === area) &&
      (!term || [p.name, p.suburb, p.city, p.province, p.location, p.description]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(term))),
    )
  }, [all, q, province, city, area])

  const hasFilters = q || province || city || area
  const clearAll = () => { setQ(''); setProvince(''); setCity(''); setArea('') }
  const goBack = () => (window.history.length > 1 ? nav(-1) : nav('/'))

  return (
    <div className="pub">
      <header className="pub-top">
        <div className="pub-top-l">
          <button className="btn ghost sm" onClick={goBack}>‹ Back</button>
          <Link to="/" className="pub-brand">RentLoja</Link>
        </div>
        <Link to="/manager/auth" className="btn ghost sm">Manage properties</Link>
      </header>

      <div className="pub-hero">
        <h1>Places to rent</h1>
        <p className="muted">Homes and rooms listed by property managers on RentLoja.</p>
        <div className="pub-filters">
          <input className="input pub-search" placeholder="Search by name, area or city…"
            value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select" value={province}
            onChange={(e) => { setProvince(e.target.value); setCity(''); setArea('') }}>
            <option value="">All provinces</option>
            {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="select" value={city}
            onChange={(e) => { setCity(e.target.value); setArea('') }}>
            <option value="">All cities</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="select" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">All areas</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          {hasFilters && <button className="btn ghost sm" onClick={clearAll}>Clear</button>}
        </div>
        {!loading && !error && (
          <div className="pub-count muted">{items.length} {items.length === 1 ? 'place' : 'places'}{hasFilters ? ' match your filters' : ' available'}</div>
        )}
      </div>

      <div className="pub-wrap">
        {loading ? <div className="center" style={{ minHeight: 240 }}><Spinner /></div>
          : error ? <div className="card pad"><EmptyState icon="⚠️" title="Couldn’t load listings">{error}</EmptyState></div>
          : items.length === 0 ? <div className="card pad"><EmptyState icon="🏠" title={hasFilters ? 'No places match' : 'No listings yet'}>{hasFilters ? 'Try widening your search or clearing the filters.' : 'Check back soon — new places are added often.'}</EmptyState></div>
          : (
            <div className="pub-grid">
              {items.map((p) => {
                const cover = Array.isArray(p.photos) && p.photos[0]
                return (
                  <Link key={p.id} to={`/rent/${p.id}`} className="pub-card">
                    <div className="pub-card-img" style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
                      {!cover && <span className="pub-card-noimg">🏠</span>}
                      {p.ad_rent != null && (
                        <span className="pub-card-price">{money(p.ad_rent)}{p.ad_currency && p.ad_currency !== 'USD' ? ` ${p.ad_currency}` : ''}/mo</span>
                      )}
                    </div>
                    <div className="pub-card-body">
                      <div className="pub-card-name">{p.name}</div>
                      <div className="muted pub-card-loc">{[p.suburb, p.city].filter(Boolean).join(', ') || p.location || '—'}</div>
                      <div className="pub-card-specs">
                        {p.bedrooms != null && <span>{p.bedrooms} bed</span>}
                        {p.bathrooms != null && <span>{p.bathrooms} bath</span>}
                        {p.furnished && <span>{p.furnished}</span>}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
      </div>

      <footer className="pub-foot">
        <span>Powered by RentLoja</span>
        <Link to="/privacy" className="muted">Privacy</Link>
      </footer>

      <style>{PUB_CSS}</style>
    </div>
  )
}

// Shared by both public pages. Kept self-contained so these render correctly
// even before the app's theme has hydrated (a logged-out visitor from a link).
export const PUB_CSS = `
  .pub { min-height: 100vh; background: var(--bg); color: var(--text); }
  .pub-top { display: flex; align-items: center; justify-content: space-between; padding: 16px 22px; max-width: 1080px; margin: 0 auto; gap: 12px; }
  .pub-top-l { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .pub-brand { font-weight: 800; font-size: 1.3rem; letter-spacing: -.02em; color: var(--text); text-decoration: none; }
  .pub-hero { max-width: 1080px; margin: 0 auto; padding: 20px 22px 8px; }
  .pub-hero h1 { font-size: 2rem; margin: 0; }
  .pub-search { max-width: 460px; margin-top: 16px; }
  .pub-filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 16px; }
  .pub-filters .pub-search { margin-top: 0; flex: 1 1 240px; min-width: 190px; }
  .pub-filters .select { flex: 0 1 auto; min-width: 148px; }
  .pub-count { margin-top: 12px; font-size: 0.82rem; }
  .pub-wrap { max-width: 1080px; margin: 0 auto; padding: 20px 22px 60px; }
  .pub-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 18px; }
  .pub-card { display: block; border: 1px solid var(--line); border-radius: var(--radius-lg); overflow: hidden;
    background: var(--surface); text-decoration: none; color: var(--text); transition: transform .15s, border-color .15s; }
  .pub-card:hover { transform: translateY(-3px); border-color: var(--accent-line); }
  .pub-card-img { position: relative; height: 180px; background: var(--surface-2) center/cover no-repeat; display: grid; place-items: center; }
  .pub-card-noimg { font-size: 2.4rem; opacity: .4; }
  .pub-card-price { position: absolute; left: 10px; bottom: 10px; background: rgba(0,0,0,.72); color: #fff;
    padding: 5px 10px; border-radius: 99px; font-weight: 700; font-size: 0.86rem; }
  .pub-card-body { padding: 13px 15px; }
  .pub-card-name { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pub-card-loc { font-size: 0.84rem; margin-top: 2px; }
  .pub-card-specs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .pub-card-specs span { font-size: 0.76rem; background: var(--surface-2); border: 1px solid var(--line);
    border-radius: 99px; padding: 3px 9px; color: var(--text-dim); }
  .pub-foot { max-width: 1080px; margin: 0 auto; padding: 24px 22px 40px; display: flex; justify-content: space-between;
    border-top: 1px solid var(--line-soft); font-size: 0.82rem; color: var(--text-faint); }
  .pub-foot a { color: var(--text-faint); text-decoration: none; }
`
