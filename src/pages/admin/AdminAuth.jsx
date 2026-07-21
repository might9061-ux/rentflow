import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import AuthShell from '../AuthShell.jsx'
import ForgotPasswordModal from '../ForgotPasswordModal.jsx'
import { Input, PasswordInput } from '../../components/Field.jsx'
import { isEmailOrPhone } from '../../lib/validate.js'
import { friendlyError } from '../../lib/errors.js'

// Dedicated App-owner (platform admin) sign-in, reached only at /admin/login.
// Not linked from anywhere public.
export default function AdminAuth() {
  const { signInManager, session, profile } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [form, setForm] = useState({ email: '', password: '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // Already signed in as the app owner → go straight to the console.
  if (session && profile?.platform_admin) return <Navigate to="/admin" replace />

  const submit = async (e) => {
    e.preventDefault()
    if (!isEmailOrPhone(form.email)) return toast.error('Invalid login', 'Enter your email or phone number.')
    setBusy(true)
    try {
      await signInManager({ identifier: form.email, password: form.password })
      nav('/admin')
    } catch (err) {
      toast.error('Sign in failed', friendlyError(err))
      setBusy(false)
    }
  }

  return (
    <AuthShell
      accent="gold"
      eyebrow="App owner"
      title="Admin console"
      subtitle="Sign in to manage the RentLoja platform."
    >
      <form onSubmit={submit}>
        <Input label="Email" autoComplete="username" value={form.email} onChange={set('email')}
          placeholder="you@rentloja.com" required />
        <PasswordInput label="Password" autoComplete="current-password" value={form.password} onChange={set('password')} required />
        {/* Without this the App owner has no way back into their own console. */}
        <div style={{ textAlign: 'right', marginTop: -4 }}>
          <button type="button" className="link-btn" onClick={() => setForgot(true)}>Forgot password?</button>
        </div>
        <button className="btn primary block lg" disabled={busy} style={{ marginTop: 6 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {forgot && (
        <ForgotPasswordModal accent="gold" role="manager" initialEmail={form.email}
          onClose={() => setForgot(false)}
          onReset={(email) => setForm((f) => ({ ...f, email, password: '' }))} />
      )}
    </AuthShell>
  )
}
