// Tenant first-login verification via one-time codes (email/phone). All logic
// lives in SECURITY DEFINER RPCs; this just exposes them.
import { Router } from 'express'
import { h, ok } from '../auth.js'
import { admin } from '../supabase.js'
import { sendOtpEmail } from '../lib/email.js'

const router = Router()

// POST /api/otp/request { channel } — generate a code and deliver it.
// The DB RPC stores the code; we then read it back (service role) and send it.
// Email codes go out via Resend. Phone codes have no SMS provider yet.
router.post('/request', h(async (req, res) => {
  const channel = req.body?.channel === 'phone' ? 'phone' : 'email'
  ok(await req.db.rpc('request_otp', { p_tenant_id: req.user.id, p_channel: channel }))

  if (channel === 'email') {
    const { data: codes } = await admin.from('otp_codes')
      .select('code').eq('tenant_id', req.user.id).eq('channel', 'email').eq('consumed', false)
      .order('created_at', { ascending: false }).limit(1)
    const code = codes?.[0]?.code
    const { data: tenant } = await admin.from('tenants')
      .select('email, first_name').eq('id', req.user.id).single()
    if (code && tenant?.email) await sendOtpEmail(tenant.email, tenant.first_name, code)
    return res.json({ sent: true, channel })
  }

  // Phone: code is generated but SMS delivery isn't wired — tell the client.
  res.json({ sent: false, channel, message: 'SMS is not enabled yet — verify by email instead.' })
}))

// POST /api/otp/verify { channel, code } — check a code.
router.post('/verify', h(async (req, res) => {
  res.json(ok(await req.db.rpc('verify_otp', { p_tenant_id: req.user.id, p_channel: req.body?.channel, p_code: req.body?.code })))
}))

// POST /api/otp/first-login-complete — mark first-login done for the caller.
router.post('/first-login-complete', h(async (req, res) => {
  ok(await req.db.rpc('complete_first_login', { p_tenant_id: req.user.id }))
  res.json({ ok: true })
}))

export default router
