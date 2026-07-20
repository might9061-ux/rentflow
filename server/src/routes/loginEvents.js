// Sign-in notifications.
//
// Supabase handles authentication in the browser, so the server never sees a
// login. The app therefore reports one here after signing in, and we decide
// whether it came from a device this account has used before. Only genuinely
// new devices trigger an email — alerting on every login trains people to
// ignore the alerts, which defeats the point.
//
// Everything here is best-effort: a geolocation outage or a mail failure must
// never stop someone signing in, so failures are logged and swallowed.
import { Router } from 'express'
import crypto from 'crypto'
import { admin } from '../supabase.js'
import { h } from '../auth.js'
import { sendNewDeviceEmail, emailConfigured } from '../lib/email.js'

const router = Router()

// The caller's real IP. Render (like most hosts) puts the client address at the
// head of x-forwarded-for; everything after it is proxy hops.
function clientIp(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return fwd || req.socket?.remoteAddress || ''
}

// A readable device name from the user-agent. Not identification — just
// something recognisable in the email ("Chrome on Android").
function describeDevice(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) && !/Chromium/.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'a browser'
  const os = /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iPhone/iPad'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'Mac'
    : /Linux/.test(ua) ? 'Linux'
    : 'an unknown device'
  return `${browser} on ${os}`
}

// Same browser+OS+IP-network counts as the same device. Hashed so we store a
// fingerprint rather than a raw profile of the user.
function deviceHash(ua, ip) {
  const network = ip.split('.').slice(0, 2).join('.') // rough ISP/area, tolerates a changing IP
  return crypto.createHash('sha256').update(`${describeDevice(ua)}|${network}`).digest('hex').slice(0, 32)
}

// Approximate city/country from the IP. Free, keyless, and entirely optional —
// if every provider fails the email simply omits the location line.
//
// Several are tried in turn because these free endpoints are individually
// unreliable: they rate-limit, and some block requests from datacenter ranges
// (which is exactly what a hosted API is). One being down shouldn't cost us the
// location on a security alert.
const GEO_PROVIDERS = [
  { url: (ip) => `https://ipapi.co/${ip}/json/`, pick: (j) => [j.city, j.region, j.country_name] },
  { url: (ip) => `https://ipwho.is/${ip}`, pick: (j) => (j.success === false ? [] : [j.city, j.region, j.country]) },
  // HTTP-only on the free tier. Safe here — this is server-to-server, not a
  // browser request, so there's no mixed-content issue.
  { url: (ip) => `http://ip-api.com/json/${ip}`, pick: (j) => (j.status === 'fail' ? [] : [j.city, j.regionName, j.country]) },
]

async function locate(ip) {
  if (!ip || /^(10\.|192\.168\.|127\.|::1|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) return null
  for (const p of GEO_PROVIDERS) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 3500)
      const r = await fetch(p.url(encodeURIComponent(ip)), {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'rentloja/1.0' },
      })
      clearTimeout(timer)
      if (!r.ok) continue
      const j = await r.json()
      if (j?.error) continue
      const label = p.pick(j).filter(Boolean).join(', ')
      if (label) return label
    } catch { /* try the next provider */ }
  }
  return null
}

// POST /api/login-events — "I just signed in." Records the device and, if it's
// new, emails the account owner.
router.post('/', h(async (req, res) => {
  const ua = req.headers['user-agent'] || ''
  const ip = clientIp(req)
  const hash = deviceHash(ua, ip)
  const label = describeDevice(ua)

  const { data: known } = await admin.from('login_devices')
    .select('id').eq('user_id', req.user.id).eq('device_hash', hash).maybeSingle()

  if (known) {
    await admin.from('login_devices').update({ last_seen: new Date().toISOString(), ip }).eq('id', known.id)
    return res.json({ recorded: true, newDevice: false })
  }

  const location = await locate(ip)
  await admin.from('login_devices').insert({
    user_id: req.user.id, device_hash: hash, user_agent: ua, label, ip, location,
  })

  // First device ever seen for this account? That's the sign-up itself — no
  // point alerting someone about the device they're reading the email on.
  const { count } = await admin.from('login_devices')
    .select('id', { count: 'exact', head: true }).eq('user_id', req.user.id)
  const isFirstEver = (count || 0) <= 1

  let emailed = false
  if (!isFirstEver && emailConfigured() && req.user.email) {
    try {
      await sendNewDeviceEmail(req.user.email, {
        name: req.user.user_metadata?.first_name,
        label,
        location,
        ip,
        when: new Date().toUTCString(),
        supportEmail: process.env.SUPPORT_EMAIL,
      })
      emailed = true
    } catch (e) { console.error('[login-events] alert email failed:', e?.message || e) }
  }

  res.json({ recorded: true, newDevice: true, emailed, location })
}))

// GET /api/login-events/devices — devices this account has signed in from.
router.get('/devices', h(async (req, res) => {
  const { data } = await admin.from('login_devices')
    .select('id, label, location, ip, first_seen, last_seen')
    .eq('user_id', req.user.id).order('last_seen', { ascending: false }).limit(20)
  res.json(data || [])
}))

export default router
