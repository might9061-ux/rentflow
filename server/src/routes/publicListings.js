// PUBLIC property listings — no auth. This is the only route that serves
// property data to anonymous callers, so the projection here IS the privacy
// boundary.
//
// It reads with the service role (which bypasses RLS) and returns ONLY the
// whitelisted, advert-safe columns of properties that are actually advertised.
// It never joins tenants, never returns the owning manager's row, and never
// exposes any column not in SAFE_COLUMNS below — internal notes, caretaker
// details, timestamps of who lives where, none of it. Adding a field to a
// listing means adding it to this list on purpose.
import { Router } from 'express'
import { admin } from '../supabase.js'

const router = Router()

// The complete public surface of a property. If it's not here, the internet
// never sees it.
const SAFE_COLUMNS = [
  'id', 'name', 'type', 'location', 'suburb', 'city', 'province', 'map_link',
  'photos', 'amenities',
  'bedrooms', 'bathrooms', 'lounges', 'floor_size', 'stand_size', 'furnished', 'year_built', 'storeys',
  'ad_rent', 'ad_currency', 'deposit', 'available_from', 'utilities_included', 'max_occupants', 'levy_fee',
  'description', 'rules',
  'ad_contact_name', 'ad_contact_phone',
  'advertised_at',
].join(', ')

const MAX_LIST = 60

// GET /api/public/listings?city=&type=&q=  — browse advertised properties.
router.get('/', async (req, res) => {
  try {
    let q = admin.from('properties').select(SAFE_COLUMNS)
      .eq('is_advertised', true)
      .order('advertised_at', { ascending: false, nullsFirst: false })
      .limit(MAX_LIST)

    // Optional narrowing. All operate on already-public columns.
    const city = String(req.query.city || '').trim()
    const type = String(req.query.type || '').trim()
    if (city) q = q.ilike('city', `%${city}%`)
    if (type) q = q.eq('type', type)

    const { data, error } = await q
    if (error) throw error

    // Free-text filter done here rather than in SQL so we never build a query
    // string from user input.
    const term = String(req.query.q || '').trim().toLowerCase()
    let rows = data || []
    if (term) {
      rows = rows.filter((p) => [p.name, p.suburb, p.city, p.description]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(term)))
    }
    res.json(rows)
  } catch (e) {
    console.error('[public-listings] list failed:', e?.message || e)
    res.status(500).json({ error: 'Could not load listings.' })
  }
})

// GET /api/public/listings/:id — one advertised property.
// A property that isn't advertised returns 404, not 403 — anonymous callers
// must not be able to tell a private property apart from a nonexistent one.
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await admin.from('properties').select(SAFE_COLUMNS)
      .eq('id', req.params.id).eq('is_advertised', true).maybeSingle()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Listing not found.' })
    res.json(data)
  } catch (e) {
    console.error('[public-listings] get failed:', e?.message || e)
    res.status(500).json({ error: 'Could not load the listing.' })
  }
})

export default router
