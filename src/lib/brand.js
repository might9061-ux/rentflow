// White-label branding helpers. Available on Growth plans and above (capacity
// of 10+ tenants). When a brand colour/logo/name is set it overrides the
// default RentLoja design across the manager workspace and their tenants'
// portal; otherwise the existing design stays.

export function canBrand(manager) {
  return !!manager?.plan_active && Number(manager?.plan_capacity || 0) >= 10
}

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return null
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
}

export function hexToRgba(hex, a) {
  const c = hexToRgb(hex)
  return c ? `rgba(${c.r}, ${c.g}, ${c.b}, ${a})` : ''
}

export function lighten(hex, amt = 0.18) {
  const c = hexToRgb(hex)
  if (!c) return hex
  const f = (x) => Math.round(x + (255 - x) * amt)
  return `#${[f(c.r), f(c.g), f(c.b)].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

// ── Cached brand (for the lock screen) ──────────────────────────────────────
// The lock screen has to render the right brand with no network and while
// offline. Managers carry their brand on their own profile row, but a tenant's
// brand belongs to their MANAGER — normally a fetch we can't make while locked.
// So each layout caches what it resolved, per user.
const BRAND_KEY = 'rentflow_brand_v1'
const MAX_LOGO = 200_000 // logos are data URLs; skip huge ones rather than blow the quota

function allBrands() {
  try { return JSON.parse(localStorage.getItem(BRAND_KEY)) || {} } catch { return {} }
}

export function cacheBrand(userId, brand) {
  if (!userId) return
  const logo = typeof brand?.logo === 'string' && brand.logo.length <= MAX_LOGO ? brand.logo : null
  const v = allBrands()
  v[userId] = { name: brand?.name || null, logo, color: brand?.color || null }
  try { localStorage.setItem(BRAND_KEY, JSON.stringify(v)) } catch { /* quota — non-fatal */ }
}

export function readBrand(userId) { return (userId && allBrands()[userId]) || null }

// Display values, falling back to the RentLoja default. `custom` drives the
// small "Powered by RentLoja" credit shown on white-labelled workspaces.
export function brandDisplay(brand) {
  return {
    name: brand?.name || 'RentLoja',
    logo: brand?.logo || null,
    mark: brand?.name ? brand.name.slice(0, 2).toUpperCase() : 'RL',
    custom: !!brand?.name,
  }
}

// CSS custom properties that re-theme the accent to the brand colour.
// Returns undefined when there's no valid colour (keeps the default theme).
export function brandVars(color) {
  if (!hexToRgb(color)) return undefined
  return {
    '--accent': color,
    '--accent-soft': lighten(color, 0.18),
    '--accent-bg': hexToRgba(color, 0.12),
    '--accent-line': hexToRgba(color, 0.32),
  }
}
