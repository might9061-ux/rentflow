import { useState } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import AuthShell from '../AuthShell.jsx'
import ForgotPasswordModal from '../ForgotPasswordModal.jsx'
import { Input, EmailInput, PasswordInput, Row } from '../../components/Field.jsx'
import PhoneInput from '../../components/PhoneInput.jsx'
import { isValidEmail } from '../../lib/format.js'
import { isEmailOrPhone } from '../../lib/validate.js'
import { friendlyError } from '../../lib/errors.js'

export default function ManagerAuth() {
  const { signInManager, signUpManager, resendVerification } = useAuth()
  const toast = useToast()
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [forgot, setForgot] = useState(false)
  const [busy, setBusy] = useState(false)
  const [verifyEmail, setVerifyEmail] = useState(null) // set → show "check your email" screen
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', password: '', country: 'ZW',
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (mode === 'signup') {
      if (!isValidEmail(form.email)) return toast.error('Invalid email', 'Enter a valid email address, e.g. name@example.com.')
    } else if (!isEmailOrPhone(form.email)) {
      return toast.error('Invalid login', 'Enter your phone number or email address.')
    }
    setBusy(true)
    try {
      if (mode === 'signup') {
        const r = await signUpManager(form)
        // Real backend: a verification email was sent and no session exists yet.
        if (r?.needsVerification) setVerifyEmail(r.email || form.email)
        else toast.success('Account created', 'Welcome to RentLoja.')
      } else {
        await signInManager({ identifier: form.email, password: form.password })
      }
    } catch (err) {
      toast.error(mode === 'signup' ? 'Sign up failed' : 'Sign in failed', friendlyError(err))
    } finally { setBusy(false) }
  }

  const resend = async () => {
    setBusy(true)
    try { await resendVerification(verifyEmail); toast.success('Email sent', `We re-sent the verification link to ${verifyEmail}.`) }
    catch (err) { toast.error('Could not resend', err.message) }
    finally { setBusy(false) }
  }

  // After sign-up on the real backend, show a "verify your email" confirmation
  // instead of the form — the account can't sign in until the link is clicked.
  if (verifyEmail) {
    return (
      <AuthShell accent="gold" eyebrow="Property Manager" title="Verify your email"
        subtitle="One last step to activate your account."
        footer={<>Wrong address? <button className="link-btn" onClick={() => { setVerifyEmail(null); setMode('signup') }}>Go back</button></>}>
        <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
          <div style={{ fontSize: '2.6rem', marginBottom: 10 }}>📧</div>
          <p style={{ marginBottom: 6 }}>We've sent a verification link to</p>
          <p style={{ fontWeight: 700, marginBottom: 14 }}>{verifyEmail}</p>
          <p className="muted" style={{ fontSize: '0.88rem', marginBottom: 20 }}>
            Open the email and click the link to activate your account. Then come back and sign in.
            Check your spam folder if you don't see it within a minute.
          </p>
          <button className="btn ghost block" disabled={busy} onClick={resend} style={{ marginBottom: 10 }}>
            {busy ? 'Please wait…' : 'Resend email'}
          </button>
          <button className="btn primary block" onClick={() => { setVerifyEmail(null); setMode('signin') }}>
            Back to sign in
          </button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      accent="gold"
      eyebrow="Property Manager"
      title={mode === 'signin' ? 'Welcome back' : 'Create your account'}
      subtitle={mode === 'signin' ? 'Sign in to manage your properties.' : 'Set up your manager workspace.'}
      footer={
        mode === 'signin'
          ? <>New here? <button className="link-btn" onClick={() => setMode('signup')}>Create an account</button></>
          : <>Already have an account? <button className="link-btn" onClick={() => setMode('signin')}>Sign in</button></>
      }
    >
      <form onSubmit={submit}>
        {mode === 'signup' && (
          <Row>
            <Input label="First name" value={form.first_name} onChange={set('first_name')} required />
            <Input label="Last name" value={form.last_name} onChange={set('last_name')} required />
          </Row>
        )}
        {mode === 'signin'
          ? <Input label="Phone or email" autoComplete="username" value={form.email} onChange={set('email')}
              placeholder="0772 000 111 or name@example.com" required />
          : <EmailInput label="Email" autoComplete="email" value={form.email} onChange={set('email')} required />}
        {mode === 'signup' && (
          <PhoneInput label="Phone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
        )}
        <PasswordInput label="Password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          value={form.password} onChange={set('password')} required minLength={6} />

        {mode === 'signin' && (
          <div style={{ textAlign: 'right', marginTop: -8, marginBottom: 14 }}>
            <button type="button" className="link-btn" onClick={() => setForgot(true)} style={{ fontWeight: 500, fontSize: '0.84rem' }}>
              Forgot password?
            </button>
          </div>
        )}

        <button className="btn primary block lg" disabled={busy} style={{ marginTop: 6 }}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>

        {mode === 'signup' && (
          <p className="muted" style={{ fontSize: '0.8rem', textAlign: 'center', marginTop: 12 }}>
            We'll email you a link to verify your account before you can sign in.
          </p>
        )}
      </form>

      {forgot && (
        <ForgotPasswordModal accent="gold" role="manager" initialEmail={form.email}
          onClose={() => setForgot(false)}
          onReset={(email) => setForm((f) => ({ ...f, email, password: '' }))} />
      )}
    </AuthShell>
  )
}
