// Mandatory emailed one-time code, required on every password sign-in for
// every role (manager, staff, platform admin, tenant) — public/pre-auth,
// mirroring authReset.js.
//
// Flow:
//   1. POST /start   — verify the password against Supabase itself (this is
//      the only way to check a Supabase Auth password without reimplementing
//      hashing). On success we get a REAL session back, but we don't hand it
//      to the browser yet: it's stashed in login_challenges keyed by a fresh
//      challenge id, and a 6-digit code is emailed.
//   2. POST /verify  — the code is checked against that row; only then are
//      the stashed tokens released to the browser.
//   3. POST /resend  — regenerate the code for an in-flight challenge.
//
// A stolen password alone is never enough to obtain a usable session — unlike
// a client-side-only checkpoint, which would let anyone skip the code by
// calling supabase.auth.signInWithPassword directly.
import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import { admin } from '../supabase.js'
import { sendOtpEmail, emailConfigured } from '../lib/email.js'

const router = Router()
const CODE_TTL_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 5
const RESEND_COOLDOWN_MS = 20 * 1000

// Shape of a manager-issued password — see tempPassword() in routes/admin.js.
// Anything else means the tenant chose it themselves.
const TEMP_PASSWORD_RE = /^TEMP-[A-Z0-9]{4}$/

// A temp password is a shared secret: the manager typed it and usually sent it
// over WhatsApp, where it stays in the chat forever. So it dies on a timer even
// if never used…
const TEMP_PASSWORD_TTL_MS = 7 * 24 * 60 * 60 * 1000
// …and it is single-use, with a short window after the first sign-in so an
// interrupted setup (dropped signal, app closed on the password screen) isn't
// instantly fatal. Setting their own password replaces it outright anyway.
const TEMP_PASSWORD_GRACE_MS = 60 * 60 * 1000

// Decide whether a manager-issued password may still be used.
// Never blocks on a lookup failure: if the columns aren't there yet (code
// deployed ahead of migration 0027) sign-in must keep working.
async function checkTempPassword(tenantId) {
  const { data: t, error } = await admin.from('tenants')
    .select('temp_password_issued_at, temp_password_used_at').eq('id', tenantId).maybeSingle()
  if (error || !t) return { ok: true }

  const now = Date.now()
  const askManager = 'Ask your property manager to send you a new one.'

  if (t.temp_password_issued_at && now - new Date(t.temp_password_issued_at).getTime() > TEMP_PASSWORD_TTL_MS) {
    return { ok: false, error: `That temporary password has expired. ${askManager}` }
  }
  if (t.temp_password_used_at && now - new Date(t.temp_password_used_at).getTime() > TEMP_PASSWORD_GRACE_MS) {
    return { ok: false, error: `That temporary password has already been used. ${askManager}` }
  }
  if (!t.temp_password_used_at) {
    await admin.from('tenants').update({ temp_password_used_at: new Date().toISOString() }).eq('id', tenantId)
  }
  return { ok: true }
}

// Fresh, throwaway client per password check — a password grant has nothing
// to do with the shared service-role `admin` client (which bypasses RLS) and
// must never share in-memory session state across concurrent requests.
function passwordClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function genCode() {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
}

// Very small in-memory throttle on password attempts per identifier — this
// process only; fine for the login screen, not a substitute for a WAF.
const attemptLog = new Map() // identifier -> [timestamps]
function tooManyStarts(identifier) {
  const now = Date.now()
  const hits = (attemptLog.get(identifier) || []).filter((t) => now - t < 15 * 60 * 1000)
  hits.push(now)
  attemptLog.set(identifier, hits)
  if (attemptLog.size > 5000) for (const [k, v] of attemptLog) if (!v.some((t) => now - t < 15 * 60 * 1000)) attemptLog.delete(k)
  return hits.length > 8
}

router.post('/start', async (req, res) => {
  try {
    const role = req.body?.role === 'tenant' ? 'tenant' : 'manager'
    const identifier = String(req.body?.identifier || req.body?.email || '').trim()
    const password = String(req.body?.password || '')
    if (!identifier || !password) return res.status(400).json({ error: 'Enter your login and password.' })
    if (tooManyStarts(identifier.toLowerCase())) {
      return res.status(429).json({ error: 'Too many attempts. Wait a while and try again.' })
    }

    // Resolve phone → email exactly like the direct-Supabase client used to.
    let email = identifier
    if (!email.includes('@')) {
      const { data } = await admin.rpc('email_for_login', { p_phone: identifier })
      if (!data) return res.status(400).json({ error: 'No account found for that phone number.' })
      email = data
    }

    const pw = passwordClient()
    const { data, error } = await pw.auth.signInWithPassword({ email, password })
    if (error || !data?.session) return res.status(400).json({ error: 'Incorrect email/phone or password. Please try again.' })

    const table = role === 'tenant' ? 'tenants' : 'managers'
    const { data: match } = await admin.from(table).select('id, account_status').eq('id', data.user.id).maybeSingle()
    if (!match) {
      const msg = role === 'tenant'
        ? 'This login isn’t a tenant account. If you’re a property manager, use the manager sign-in page.'
        : 'Your password is correct, but this account has no manager workspace set up. If you’re a tenant, use the tenant sign-in instead. Otherwise email support@rentloja.com and we’ll finish setting it up.'
      return res.status(400).json({ error: msg })
    }
    // A suspended account can still hold valid credentials — stop it obtaining a
    // session at all (an agent the owner suspended must not be able to sign in).
    if (match.account_status === 'suspended') {
      return res.status(403).json({ error: 'Your access has been suspended. Contact the account owner.' })
    }

    if (role === 'tenant') {
      // Every manager-issued password is minted by tempPassword() in
      // routes/admin.js as TEMP-XXXX, and a manager has no way to choose a
      // custom one — so the shape tells us which kind this is.
      if (TEMP_PASSWORD_RE.test(password)) {
        const gate = await checkTempPassword(data.user.id)
        if (!gate.ok) return res.status(400).json({ error: gate.error })
      } else {
        // Not a temp password, so the tenant has already chosen their own —
        // stop sending them to "Set your password". first_login used to be
        // cleared only by that screen, so anyone who set their password another
        // way (the reset link) kept being asked to set one they already had.
        //
        // Only ever clears the flag: a tenant still on TEMP-XXXX keeps it, so
        // the password their manager knows can never become permanent.
        const { error: clrErr } = await admin.from('tenants')
          .update({ first_login: false }).eq('id', data.user.id).eq('first_login', true)
        if (clrErr) console.error('[login-otp] could not clear first_login:', clrErr.message)
      }
    }

    // Opportunistic cleanup — no cron needed for a table this small.
    await admin.from('login_challenges').delete().lt('expires_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

    const code = genCode()
    const { data: row, error: insErr } = await admin.from('login_challenges').insert({
      account_type: role,
      account_id: data.user.id,
      email,
      code,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    }).select('id').single()
    if (insErr) throw new Error(insErr.message)

    let dev_code
    if (emailConfigured()) {
      await sendOtpEmail(email, null, code)
    } else {
      // No RESEND_API_KEY in this environment (e.g. local dev) — surface the
      // code directly instead of silently locking every login. Never happens
      // once email is configured; mirrors the DEMO_MODE OTP fallback already
      // used for tenant verification.
      console.warn('[login-otp] RESEND_API_KEY not set — code for', email, 'is', code)
      dev_code = code
    }

    res.json({ challenge_id: row.id, email, ...(dev_code ? { dev_code } : {}) })
  } catch (e) {
    console.error('[login-otp] start failed:', e?.message || e)
    res.status(500).json({ error: 'Could not process the request. Please try again.' })
  }
})

router.post('/verify', async (req, res) => {
  try {
    const challengeId = String(req.body?.challenge_id || '')
    const code = String(req.body?.code || '').trim()
    if (!challengeId || !code) return res.status(400).json({ error: 'Enter the 6-digit code.' })

    const { data: row } = await admin.from('login_challenges').select('*').eq('id', challengeId).maybeSingle()
    if (!row || row.consumed) return res.status(400).json({ error: 'This code has expired. Sign in again.' })
    if (new Date(row.expires_at) < new Date()) return res.status(400).json({ error: 'This code has expired. Sign in again.' })
    if (row.attempts >= MAX_ATTEMPTS) {
      await admin.from('login_challenges').update({ consumed: true }).eq('id', challengeId)
      return res.status(400).json({ error: 'Too many incorrect attempts. Sign in again.' })
    }
    if (row.code !== code) {
      await admin.from('login_challenges').update({ attempts: row.attempts + 1 }).eq('id', challengeId)
      return res.status(400).json({ error: 'Incorrect code. Check your email and try again.' })
    }

    await admin.from('login_challenges').update({ consumed: true }).eq('id', challengeId)

    let first_login
    if (row.account_type === 'tenant') {
      const { data: t } = await admin.from('tenants').select('first_login').eq('id', row.account_id).maybeSingle()
      first_login = t?.first_login
      // The code they just entered was emailed to the address their manager
      // registered, so getting here IS proof of that address. Record it, rather
      // than asking them to prove the same thing a second time on the next
      // screen. Best-effort: a failed flag update must never fail a sign-in.
      const { error: vErr } = await admin.from('tenants')
        .update({ email_verified: true }).eq('id', row.account_id).eq('email_verified', false)
      if (vErr) console.error('[login-otp] could not mark email verified:', vErr.message)
    }

    res.json({ access_token: row.access_token, refresh_token: row.refresh_token, first_login })
  } catch (e) {
    console.error('[login-otp] verify failed:', e?.message || e)
    res.status(500).json({ error: 'Could not process the request. Please try again.' })
  }
})

router.post('/resend', async (req, res) => {
  try {
    const challengeId = String(req.body?.challenge_id || '')
    const { data: row } = await admin.from('login_challenges').select('*').eq('id', challengeId).maybeSingle()
    if (!row || row.consumed || new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This code has expired. Sign in again.' })
    }
    if (Date.now() - new Date(row.created_at).getTime() < RESEND_COOLDOWN_MS) {
      return res.status(429).json({ error: 'Wait a few seconds before requesting another code.' })
    }

    const code = genCode()
    await admin.from('login_challenges').update({
      code, attempts: 0, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    }).eq('id', challengeId)

    let dev_code
    if (emailConfigured()) {
      await sendOtpEmail(row.email, null, code)
    } else {
      console.warn('[login-otp] RESEND_API_KEY not set — code for', row.email, 'is', code)
      dev_code = code
    }

    res.json({ ok: true, ...(dev_code ? { dev_code } : {}) })
  } catch (e) {
    console.error('[login-otp] resend failed:', e?.message || e)
    res.status(500).json({ error: 'Could not process the request. Please try again.' })
  }
})

export default router
