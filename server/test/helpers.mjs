// ═══════════════════════════════════════════════════════════════════════════
// Test harness — creates disposable accounts and ALWAYS cleans them up.
//
// Written after a test script timed out mid-run and left a platform_admin
// account behind in the LIVE database. Two safeguards come from that:
//
//   1. It refuses to run against production. Tests need TEST_SUPABASE_URL
//      (a separate project); if that matches SUPABASE_URL, it aborts.
//   2. Cleanup is registered up-front and runs on normal exit, on an
//      exception, on an unhandled rejection, and on Ctrl-C / kill — not only
//      in a `finally` block that a timeout can skip.
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js'

const TEST_URL = process.env.TEST_SUPABASE_URL
const TEST_SERVICE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY
const TEST_ANON = process.env.TEST_SUPABASE_ANON_KEY

if (!TEST_URL || !TEST_SERVICE || !TEST_ANON) {
  console.error('\n✖ Test credentials missing.\n' +
    '  Set TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY and TEST_SUPABASE_SERVICE_ROLE_KEY\n' +
    '  in server/.env.test — see .env.test.example.\n')
  process.exit(1)
}
if (TEST_URL === process.env.SUPABASE_URL) {
  console.error('\n✖ TEST_SUPABASE_URL is the PRODUCTION project. Refusing to run.\n' +
    '  Tests must point at a separate Supabase project.\n')
  process.exit(1)
}

export const admin = createClient(TEST_URL, TEST_SERVICE, { auth: { persistSession: false } })
export const anon = createClient(TEST_URL, TEST_ANON, { auth: { persistSession: false } })

// Everything created during the run, torn down no matter how the run ends.
const created = new Set()
let cleaning = false

export async function cleanup() {
  if (cleaning || created.size === 0) return
  cleaning = true
  for (const id of created) {
    try { await admin.from('subscription_payments').delete().eq('manager_id', id) } catch { /* ignore */ }
    try { await admin.from('payment_credentials').delete().eq('manager_id', id) } catch { /* ignore */ }
    try { await admin.from('managers').delete().eq('id', id) } catch { /* ignore */ }
    try { await admin.from('tenants').delete().eq('id', id) } catch { /* ignore */ }
    try { await admin.auth.admin.deleteUser(id) } catch { /* ignore */ }
  }
  console.log(`\n[test] cleaned up ${created.size} account(s)`)
  created.clear()
  cleaning = false
}

// Belt and braces: a timeout, a crash or Ctrl-C must not leave accounts behind.
process.on('exit', () => { if (created.size) console.error(`[test] WARNING: ${created.size} account(s) may remain`) })
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, async () => { await cleanup(); process.exit(130) })
}
process.on('uncaughtException', async (e) => { console.error(e); await cleanup(); process.exit(1) })
process.on('unhandledRejection', async (e) => { console.error(e); await cleanup(); process.exit(1) })

// A disposable manager. `platformAdmin` mirrors the App-owner role.
export async function makeManager({ platformAdmin = false, prefix = 'test' } = {}) {
  const email = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@rentloja.test`
  const password = 'TestPass123!'
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { role: 'manager', first_name: prefix, last_name: 'Test', country: 'ZW' },
  })
  if (error) throw new Error(`could not create test manager: ${error.message}`)
  const id = data.user.id
  created.add(id)

  await new Promise((r) => setTimeout(r, 700)) // let the signup trigger create the profile row
  if (platformAdmin) await admin.from('managers').update({ platform_admin: true }).eq('id', id)

  const { data: session } = await anon.auth.signInWithPassword({ email, password })
  return { id, email, password, token: session?.session?.access_token }
}

// Run a test body with guaranteed teardown.
export async function withCleanup(fn) {
  try { await fn() } finally { await cleanup() }
}
