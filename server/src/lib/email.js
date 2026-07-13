// Minimal transactional email sender using the Resend HTTP API.
// Uses RESEND_API_KEY (same Resend account as the Supabase SMTP setup).
// No extra npm dependency — just fetch.

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY)
}

async function send({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('[email] RESEND_API_KEY not set — email NOT sent:', subject)
    return { sent: false, reason: 'no_api_key' }
  }
  const from = process.env.OTP_FROM || 'RentLoja <noreply@wwwrentflow.com>'
  const resp = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html }),
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Resend send failed (${resp.status}): ${body}`)
  }
  return { sent: true }
}

// The tenant first-login verification code.
export function sendOtpEmail(to, name, code) {
  const hi = name ? `Hi ${name},` : 'Hello,'
  return send({
    to,
    subject: `Your RentLoja verification code: ${code}`,
    html: `
      <div style="font-family:system-ui,Arial,sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#0f172a">Verify your RentLoja account</h2>
        <p>${hi}</p>
        <p>Your 6-digit verification code is:</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#0f172a">${code}</p>
        <p style="color:#64748b">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
      </div>`,
  })
}
