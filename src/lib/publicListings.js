// Fetching for the PUBLIC listing pages. No auth, no Supabase session — these
// pages are viewable by anyone, so this talks to the public API endpoint
// directly and sends no credentials.
const BASE = (import.meta.env.VITE_API_URL?.trim() || '').replace(/\/+$/, '')

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`)
  const text = await res.text()
  const json = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(json?.error || `${res.status}`)
  return json
}

export function listPublicListings({ city, type, q } = {}) {
  const params = new URLSearchParams()
  if (city) params.set('city', city)
  if (type) params.set('type', type)
  if (q) params.set('q', q)
  const qs = params.toString()
  return getJson(`/api/public/listings${qs ? `?${qs}` : ''}`)
}

export function getPublicListing(id) {
  return getJson(`/api/public/listings/${encodeURIComponent(id)}`)
}
