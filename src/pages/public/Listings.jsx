import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listPublicListings } from '../../lib/publicListings.js'
import { money } from '../../lib/format.js'
import { Spinner, EmptyState } from '../../components/ui.jsx'

// Public marketplace of advertised properties. No login — anyone can browse.
export default function PublicListings() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [items, setItems] = useState([])
  const [q, setQ] = useState('')

  useEffect(() => { document.title = 'Rentals — RentLoja' }, [])
  useEffect(() => {
    let alive = true
    setLoading(true)
    listPublicListings({ q })
      .then((rows) => { if (alive) { setItems(rows); setError(null) } })
      .catch((e) => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [q])

  return (
    <div className="pub">
      <header className="pub-top">
        <Link to="/" className="pub-brand">RentLoja</Link>
        <Link to="/manager/auth" className="btn ghost sm">Manage properties</Link>
      </header>

      <div className="pub-hero">
        <h1>Places to rent</h1>
        <p className="muted">Homes and rooms listed by property managers on RentLoja.</p>
        <input className="input pub-search" placeholder="Search by area, suburb or name…"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="pub-wrap">
        {loading ? <div className="center" style={{ minHeight: 240 }}><Spinner /></div>
          : error ? <div className="card pad"><EmptyState icon="⚠️" title="Couldn’t load listings">{error}</EmptyState></div>
          : items.length === 0 ? <div className="card pad"><EmptyState icon="🏠" title="No listings yet">Check back soon — new places are added often.</EmptyState></div>
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
  .pub-top { display: flex; align-items: center; justify-content: space-between; padding: 16px 22px; max-width: 1080px; margin: 0 auto; }
  .pub-brand { font-weight: 800; font-size: 1.3rem; letter-spacing: -.02em; color: var(--text); text-decoration: none; }
  .pub-hero { max-width: 1080px; margin: 0 auto; padding: 20px 22px 8px; }
  .pub-hero h1 { font-size: 2rem; margin: 0; }
  .pub-search { max-width: 460px; margin-top: 16px; }
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
