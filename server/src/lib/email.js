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
  const from = process.env.OTP_FROM || 'RentLoja <noreply@rentloja.com>'
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

// Tell the App owner a new property manager just signed up.
export function sendNewManagerEmail(to, { name, email, when }) {
  return send({
    to,
    subject: `New RentLoja manager: ${name || email || 'signup'}`,
    html: `
      <div style="font-family:system-ui,Arial,sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#0f172a">New manager signed up 🎉</h2>
        <p><b>${name || '(no name)'}</b> just created a RentLoja manager account.</p>
        <table style="border-collapse:collapse;margin:14px 0;font-size:14px">
          <tr><td style="padding:5px 14px 5px 0;color:#64748b">Email</td><td style="color:#0f172a">${email || '—'}</td></tr>
          <tr><td style="padding:5px 14px 5px 0;color:#64748b">When</td><td style="color:#0f172a">${when || new Date().toUTCString()}</td></tr>
        </table>
        <p style="color:#64748b">They're on their free first month. See them in the admin console → Workspaces.</p>
      </div>`,
  })
}

// Alert: this account was signed into from a device we haven't seen before.
// Deliberately calm in tone — most of these are the user's own new phone — but
// it always gives a way to report it, because the one time it isn't them is
// the whole reason this exists.
export function sendNewDeviceEmail(to, { name, label, location, ip, when, supportEmail }) {
  const hi = name ? `Hi ${name},` : 'Hello,'
  const support = supportEmail || 'support@rentloja.com'
  const row = (k, v) => v
    ? `<tr><td style="padding:6px 14px 6px 0;color:#64748b;white-space:nowrap">${k}</td><td style="padding:6px 0;color:#0f172a">${v}</td></tr>`
    : ''
  return send({
    to,
    subject: 'New sign-in to your RentLoja account',
    html: `
      <div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#0f172a;margin-bottom:4px">New sign-in to your account</h2>
        <p style="color:#64748b;margin-top:0">${hi} your RentLoja account was just opened on a device we haven't seen before.</p>
        <table style="border-collapse:collapse;margin:18px 0;font-size:14px">
          ${row('Device', label)}
          ${row('Location', location)}
          ${row('IP address', ip)}
          ${row('When', when)}
        </table>
        <p style="color:#0f172a"><b>Was this you?</b> Then nothing to do — this is just so you know.</p>
        <p style="color:#0f172a">
          <b>Not you?</b> Change your password straight away, then tell us:
          <a href="mailto:${support}?subject=${encodeURIComponent('Unrecognised sign-in on my RentLoja account')}"
             style="color:#1d6fe0">${support}</a>
        </p>
        <p style="color:#94a3b8;font-size:12px;margin-top:22px">
          Location is approximate — it comes from the internet connection used, so it may show a
          nearby city or your mobile provider's location rather than exactly where you are.
        </p>
      </div>`,
  })
}
