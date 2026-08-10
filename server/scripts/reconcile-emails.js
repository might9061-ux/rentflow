// One-time maintenance: reconcile each account's LOGIN email (in Supabase Auth)
// with the email stored on its record (the `managers` and `tenants` tables).
//
// Why this exists
// ───────────────
// Editing a tenant's or agent's email used to change only the database row,
// leaving their Supabase Auth login on the OLD address — so they could no
// longer sign in ("Incorrect email/phone or password"). The API now keeps the
// two in sync (and re-saving an account repairs it), but any account edited
// BEFORE that fix stays broken until someone happens to touch it. This script
// finds every such account across the whole app and can repair them in one go.
//
// The record email is authoritative: the Auth login only ever changes through
// our own code, which always sets it FROM the record — so when they differ, the
// record holds the address the manager intended and Auth is the stale one.
//
// Safe by default
// ───────────────
// With no flags it only REPORTS mismatches and changes nothing. Pass --fix to
// actually move each stale Auth login to match its record.
//
//   cd server
//   node scripts/reconcile-emails.js          # dry run — list mismatches
//   node scripts/reconcile-emails.js --fix     # repair them
//
// Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in server/.env (already set for
// the API). Uses the service-role key, so run it locally — never expose it.

import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Load server/.env no matter which directory the script is launched from.
const here = dirname(fileURLToPath(import.meta.url))
config({ path: join(here, '..', '.env') })

const FIX = process.argv.includes('--fix')
// Import AFTER env is loaded — supabase.js reads process.env at module load.
const { admin } = await import('../src/supabase.js')

const norm = (e) => String(e || '').trim().toLowerCase()
const name = (r) => `${r.first_name || ''} ${r.last_name || ''}`.trim() || '(no name)'

// Map of auth-user id → login email, paging through every Auth user.
async function authEmailsById() {
  const map = new Map()
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`listUsers failed: ${error.message}`)
    const users = data?.users || []
    for (const u of users) map.set(u.id, u.email)
    if (users.length < 1000) break
  }
  return map
}

// Every account that has a login: owners + staff (managers table) and tenants.
async function loadRecords() {
  const rows = []
  const m = await admin.from('managers').select('id, first_name, last_name, email, role')
  if (m.error) throw new Error(`read managers: ${m.error.message}`)
  for (const r of m.data) rows.push({ kind: r.role === 'staff' ? 'agent' : 'owner', ...r })
  // Skip soft-deleted tenants: deleting a tenant intentionally removes their
  // Auth login (see migration 0034), so a missing login there is expected —
  // not email drift or a broken account.
  const t = await admin.from('tenants').select('id, first_name, last_name, email').is('deleted_at', null)
  if (t.error) throw new Error(`read tenants: ${t.error.message}`)
  for (const r of t.data) rows.push({ kind: 'tenant', ...r })
  return rows
}

async function main() {
  console.log(`\nRentFlow email reconcile — ${FIX ? 'FIX mode (will update Auth logins)' : 'DRY RUN (no changes)'}\n`)
  const [authById, records] = await Promise.all([authEmailsById(), loadRecords()])

  const mismatches = []
  const orphans = []
  for (const r of records) {
    const recEmail = norm(r.email)
    if (!recEmail) continue
    if (!authById.has(r.id)) { orphans.push(r); continue }
    const authEmail = norm(authById.get(r.id))
    if (authEmail !== recEmail) mismatches.push({ ...r, authEmail, recEmail })
  }

  if (!mismatches.length && !orphans.length) {
    console.log('✓ Every login email already matches its record. Nothing to do.\n')
    return
  }

  if (mismatches.length) {
    console.log(`Found ${mismatches.length} account(s) whose LOGIN email differs from their record:\n`)
    for (const r of mismatches) {
      console.log(`  [${r.kind}] ${name(r)}`)
      console.log(`      record (correct): ${r.recEmail}`)
      console.log(`      login  (stale)  : ${r.authEmail}`)
    }
    console.log('')
  }
  if (orphans.length) {
    console.log(`Note: ${orphans.length} record(s) have no matching Auth user — a different issue, not email drift:`)
    for (const r of orphans) console.log(`  [${r.kind}] ${name(r)} — ${norm(r.email)} (id ${r.id})`)
    console.log('')
  }

  if (!FIX) {
    console.log('Dry run only. Re-run with --fix to move each stale login to its record email.\n')
    return
  }

  let ok = 0, failed = 0
  for (const r of mismatches) {
    const upd = await admin.auth.admin.updateUserById(r.id, { email: r.recEmail, email_confirm: true })
    if (upd.error) { failed++; console.log(`  ✗ ${name(r)} (${r.recEmail}): ${upd.error.message}`) }
    else { ok++; console.log(`  ✓ ${name(r)} → ${r.recEmail}`) }
  }
  console.log(`\nRepaired ${ok} login(s)${failed ? `, ${failed} failed` : ''}.\n`)
}

main().catch((e) => { console.error('\nReconcile failed:', e.message, '\n'); process.exit(1) })
