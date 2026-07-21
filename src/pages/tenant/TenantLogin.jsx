import { useState } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { DEMO_MODE } from '../../lib/db.js'
import AuthShell from '../AuthShell.jsx'
import ForgotPasswordModal from '../ForgotPasswordModal.jsx'
import { Input, EmailInput, PasswordInput } from '../../components/Field.jsx'
import { isEmailOrPhone } from '../../lib/validate.js'
import { friendlyError } from '../../lib/errors.js'
import LoginOtpStep from '../../components/LoginOtpStep.jsx'

export default function TenantLogin() {
  const { signInTenant } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [form, setForm] = useState({ email: '', password: '' })
  const [challenge, setChallenge] = useState(null) // set → show the emailed login-code step
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!isEmailOrPhone(form.email)) return toast.error('Invalid login', 'Enter your phone number or email address.')
    setBusy(true)
    try {
      const r = await signInTenant({ identifier: form.email, password: form.password })
      if (r?.challenge_id) setChallenge(r)
      else if (r?.first_login) toast.info('Verify your account', 'Let’s confirm it’s you before you continue.')
    } catch (err) {
      toast.error('Sign in failed', friendlyError(err))
    } finally { setBusy(false) }
  }

  if (challenge) {
    return (
      <AuthShell accent="green" eyebrow="Tenant" title="One more step">
        <LoginOtpStep challenge={challenge} onBack={() => setChallenge(null)}
          onVerified={(r) => { if (r?.first_login) toast.info('Verify your account', 'Let’s confirm it’s you before you continue.') }} />
      </AuthShell>
    )
  }

  return (
    <AuthShell
      accent="green"
      eyebrow="Tenant"
      title="Sign in"
      subtitle="Use the email and password your property manager sent you."
      footer={<>First time? Use the <b>temporary password</b> from your manager — you’ll set a new one next.</>}
    >
      <form onSubmit={submit}>
        <Input label="Phone or email" autoComplete="username" value={form.email} onChange={set('email')}
          placeholder="0775 123 001 or name@example.com" required />
        <PasswordInput label="Password" autoComplete="current-password" value={form.password} onChange={set('password')} required
          hint="Temporary passwords look like TEMP-XXXX" />
        <div style={{ textAlign: 'right', marginTop: -8, marginBottom: 14 }}>
          <button type="button" className="link-btn" onClick={() => setForgot(true)} style={{ fontWeight: 500, fontSize: '0.84rem' }}>
            Forgot password?
          </button>
        </div>
        <button className="btn primary block lg" disabled={busy} style={{ marginTop: 6 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {forgot && (
        <ForgotPasswordModal accent="green" role="tenant" initialEmail={form.email}
          onClose={() => setForgot(false)}
          onReset={(email) => setForm((f) => ({ ...f, email, password: '' }))} />
      )}

      {DEMO_MODE && (
        <div style={{ marginTop: 18, fontSize: '0.78rem', color: 'var(--text-faint)', lineHeight: 1.6 }}>
          <b style={{ color: 'var(--text-dim)' }}>Demo tenants:</b><br />
          rudo@example.com / tenant123 (active)<br />
          tafadzwa@example.com / TEMP-7K2P (first login — try verification)
        </div>
      )}
    </AuthShell>
  )
}
