// Role-scoped password reset (public — the caller isn't signed in yet).
//
// The manager and tenant sign-in screens each have their own "Forgot password".
// A reset request from the MANAGER screen should only ever act on a manager
// account, and the TENANT screen only on a tenant account — otherwise a tenant
// email entered on the manager screen would receive a reset link and end up in
// the wrong place. So we check the email against the right profile table with
// the service role (the anon key can't read other people's rows) and only send
// the recovery email when it matches.
//
// Note: this intentionally tells the user whether an email is registered for
// that role, which is a mild account-enumeration trade-off chosen for clarity.
import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import { admin } from '../supabase.js'

const router = Router()
const APP_URL = (process.env.PUBLIC_APP_URL || 'https://www.rentloja.com').replace(/\/$/, '')

// Anon client purely to trigger Supabase's own recovery email (its SMTP).
const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } })

router.post('/request-reset', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const role = req.body?.role === 'tenant' ? 'tenant' : 'manager'
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Enter a valid email address.' })

    // Is this email registered in the table for the screen it was entered on?
    const table = role === 'tenant' ? 'tenants' : 'managers'
    const { data: match } = await admin.from(table).select('id').ilike('email', email).maybeSingle()

    if (!match) {
      // Guard against confusion: if it exists in the OTHER role, say so plainly.
      const otherTable = role === 'tenant' ? 'managers' : 'tenants'
      const { data: other } = await admin.from(otherTable).select('id').ilike('email', email).maybeSingle()
      return res.json({ available: false, wrongRole: !!other, role })
    }

    await anon.auth.resetPasswordForEmail(email, { redirectTo: `${APP_URL}/reset-password` })
    return res.json({ available: true, role })
  } catch (e) {
    console.error('[auth] request-reset failed:', e?.message || e)
    res.status(500).json({ error: 'Could not process the request. Please try again.' })
  }
})

export default router
