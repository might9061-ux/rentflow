// SMS via Africa's Talking (best coverage/price for Zimbabwe & African numbers).
// Needs AT_USERNAME + AT_API_KEY (and optionally AT_SENDER_ID). Set AT_SANDBOX=true
// to use the sandbox endpoint while testing (sandbox only reaches AT's simulator,
// not real phones).

const AT_LIVE = 'https://api.africastalking.com/version1/messaging'
const AT_SANDBOX = 'https://api.sandbox.africastalking.com/version1/messaging'

export function smsConfigured() {
  return Boolean(process.env.AT_API_KEY && process.env.AT_USERNAME)
}

// Normalise a local number to E.164 (Africa's Talking requires +country format).
// Defaults to Zimbabwe (+263); override with SMS_COUNTRY_CODE.
export function toE164(phone, cc = process.env.SMS_COUNTRY_CODE || '263') {
  let p = String(phone || '').replace(/[^\d+]/g, '')
  if (!p) return ''
  if (p.startsWith('+')) return p
  if (p.startsWith('00')) return `+${p.slice(2)}`
  if (p.startsWith('0')) return `+${cc}${p.slice(1)}`
  if (p.startsWith(cc)) return `+${p}`
  return `+${cc}${p}`
}

export async function sendOtpSms(phone, code) {
  const key = process.env.AT_API_KEY
  const username = process.env.AT_USERNAME
  if (!key || !username) {
    console.warn('[sms] Africa\'s Talking not configured (AT_API_KEY/AT_USERNAME) — SMS NOT sent')
    return { sent: false, reason: 'not_configured' }
  }
  const url = process.env.AT_SANDBOX === 'true' ? AT_SANDBOX : AT_LIVE
  const to = toE164(phone)
  if (!to) return { sent: false, reason: 'no_phone' }

  const body = new URLSearchParams({
    username,
    to,
    message: `Your RentPilot verification code is ${code}. It expires in 10 minutes.`,
  })
  if (process.env.AT_SENDER_ID) body.set('from', process.env.AT_SENDER_ID)

  const resp = await fetch(url, {
    method: 'POST',
    headers: { apiKey: key, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  })
  const text = await resp.text().catch(() => '')
  if (!resp.ok) throw new Error(`Africa's Talking send failed (${resp.status}): ${text}`)
  return { sent: true, raw: text }
}
