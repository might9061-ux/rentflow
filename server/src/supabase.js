// Two Supabase clients:
//   • admin      — service-role key, BYPASSES Row Level Security. Used only for
//                  privileged actions (creating auth users, etc.).
//   • forUser(t) — anon key + the caller's access token, so all normal data
//                  operations run UNDER that user's RLS. This means the API can
//                  never accidentally leak one workspace's data to another —
//                  the database enforces isolation, exactly like the direct
//                  frontend path did.
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !anonKey || !serviceKey) {
  console.error(
    '\n[rentflow-api] Missing env. Set SUPABASE_URL, SUPABASE_ANON_KEY and ' +
      'SUPABASE_SERVICE_ROLE_KEY in server/.env (copy from .env.example).\n',
  )
  process.exit(1)
}

export const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export function forUser(accessToken) {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

// Step-up check: confirm a user really knows their password before a sensitive,
// irreversible action (e.g. deleting their account). Returns true if correct.
export async function verifyPassword(email, password) {
  if (!email || !password) return false
  const c = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password })
  return !error
}
