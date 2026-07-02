// Authenticate every request from the caller's Supabase access token.
// The frontend sends `Authorization: Bearer <token>` (the logged-in user's
// session token). We verify it, then attach:
//   req.user  — the authenticated user (id, email, ...)
//   req.token — the raw access token
//   req.db    — a Supabase client scoped to this user (RLS applies)
import { admin, forUser } from './supabase.js'

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) return res.status(401).json({ error: 'Missing bearer token' })

    const { data, error } = await admin.auth.getUser(token)
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid or expired session' })

    req.user = data.user
    req.token = token
    req.db = forUser(token)
    next()
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
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
