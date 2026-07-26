// Authenticate every request from the caller's Supabase access token.
// The frontend sends `Authorization: Bearer <token>` (the logged-in user's
// session token). We verify it, then attach:
//   req.user  — the authenticated user (id, email, ...)
//   req.token — the raw access token
//   req.db    — a Supabase client scoped to this user (RLS applies)
import { admin, forUser } from './supabase.js'

// Verifying a token with Supabase is a network round-trip. Active users fire
// many requests in a row with the SAME token, so we cache the verified user for
// a short window and skip the round-trip on repeats. RLS still runs per-request
// under the caller's token, so this is purely a speed-up, not a security change.
const TOKEN_TTL_MS = 60_000
const tokenCache = new Map() // token -> { user, exp }

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) return res.status(401).json({ error: 'Missing bearer token' })

    const now = Date.now()
    let entry = tokenCache.get(token)
    if (!entry || entry.exp <= now) {
      const { data, error } = await admin.auth.getUser(token)
      if (error || !data?.user) { tokenCache.delete(token); return res.status(401).json({ error: 'Invalid or expired session' }) }
      entry = { user: data.user, exp: now + TOKEN_TTL_MS }
      tokenCache.set(token, entry)
      // Opportunistic cleanup so the map can't grow unbounded.
      if (tokenCache.size > 5000) { for (const [k, v] of tokenCache) if (v.exp <= now) tokenCache.delete(k) }
    }

    // A valid token outlives a suspension (it stays usable until it expires), so
    // check the account's status here too — suspending an agent takes effect
    // within the cache window, not only at their next sign-in.
    if (await isSuspended(entry.user.id)) {
      return res.status(403).json({ error: 'Your access has been suspended. Contact the account owner.' })
    }

    req.user = entry.user
    req.token = token
    req.db = forUser(token)
    // Assurance level from the (already verified) token: 'aal1' = password
    // only, 'aal2' = a two-factor code was entered. Privileged routes require
    // aal2 when the account has an authenticator enrolled.
    req.aal = readAal(token)
    next()
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
}

// Read the `aal` claim from a token that Supabase has ALREADY verified above —
// this is decoding, not validation, so it must never be the only check.
function readAal(token) {
  try {
    const payload = token.split('.')[1]
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return JSON.parse(json).aal || null
  } catch { return null }
}

// Does this account have a verified authenticator? Cached alongside the token
// so we don't ask Supabase on every request.
const mfaCache = new Map() // userId -> { enrolled, exp }
export async function hasVerifiedMfa(userId) {
  const now = Date.now()
  const hit = mfaCache.get(userId)
  if (hit && hit.exp > now) return hit.enrolled
  let enrolled = false
  try {
    const { data } = await admin.auth.admin.getUserById(userId)
    enrolled = (data?.user?.factors || []).some((f) => f.status === 'verified')
  } catch { enrolled = false } // a lookup failure must not lock the owner out
  mfaCache.set(userId, { enrolled, exp: now + TOKEN_TTL_MS })
  return enrolled
}

// Is this account suspended? A suspended agent (or tenant) must lose access even
// while holding a still-valid token. Cached briefly so it's not a per-request
// lookup; a short TTL means suspension takes effect within ~30s. Never blocks on
// a lookup failure, so a transient DB hiccup can't lock legitimate users out.
const SUSPEND_TTL_MS = 30_000
const suspendCache = new Map() // userId -> { suspended, exp }
async function isSuspended(userId) {
  const now = Date.now()
  const hit = suspendCache.get(userId)
  if (hit && hit.exp > now) return hit.suspended
  let suspended = false
  try {
    const { data: m } = await admin.from('managers').select('account_status').eq('id', userId).maybeSingle()
    if (m) suspended = m.account_status === 'suspended'
    else {
      const { data: t } = await admin.from('tenants').select('account_status').eq('id', userId).maybeSingle()
      if (t) suspended = t.account_status === 'suspended'
    }
  } catch { suspended = false }
  suspendCache.set(userId, { suspended, exp: now + SUSPEND_TTL_MS })
  return suspended
}

// Wrap an async handler so thrown errors become clean JSON responses.
export function h(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((e) => {
      const msg = e?.message || String(e)
      const code = /not authenticated|unauthorized/i.test(msg) ? 401
        : /not found/i.test(msg) ? 404
        : /forbidden|not your|permission/i.test(msg) ? 403
        : 400
      if (!res.headersSent) res.status(code).json({ error: msg })
    })
  }
}

// Throw on a Supabase error, else return the data (mirrors the frontend `ok`).
export function ok(resp) {
  if (resp.error) throw new Error(resp.error.message)
  return resp.data
}

// The workspace owner id for the caller (their own id, or their owner's id if
// they are a staff manager). Uses the DB's SECURITY DEFINER helper so it is
// authoritative and RLS-safe. Needed when inserting rows whose manager_id must
// equal the owner.
export async function ownerId(req) {
  return ok(await req.db.rpc('workspace_owner'))
}
