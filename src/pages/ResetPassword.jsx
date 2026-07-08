import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../context/ToastContext.jsx'
import { db, DEMO_MODE } from '../lib/db.js'
import AuthShell from './AuthShell.jsx'
import { PasswordInput } from '../components/Field.jsx'

// Landing page for the Supabase password-recovery email link. The recovery
// session is established automatically from the URL; the user just sets a new
// password here.
export default function ResetPassword() {
  const toast = useToast()
  const nav = useNavigate()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (pw.length < 6) return toast.error('Too short', 'Use at least 6 characters.')
    if (pw !== pw2) return toast.error('Passwords don’t match')
    setBusy(true)
    try {
      await db.completePasswordReset(null, null, pw)
      toast.success('Password updated', 'Sign in with your new password.')
      nav('/')
    } catch (err) { toast.error('Could not reset password', err.message); setBusy(false) }
  }

  return (
    <AuthShell accent="gold" eyebrow="Account recovery" title="Set a new password"
      subtitle="Choose a new password for your RentPilot account.">
      {DEMO_MODE && (
        <div className="banner gold" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '0.86rem' }}>
            This page handles the email recovery link in real (Supabase) mode. In demo mode, use “Forgot password?” on the sign-in screen instead.
          </div>
        </div>
      )}
      <form onSubmit={submit}>
        <PasswordInput label="New password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} autoFocus />
        <PasswordInput label="Confirm password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={6} />
        <button className="btn primary block lg" disabled={busy} style={{ marginTop: 6 }}>{busy ? 'Saving…' : 'Update password'}</button>
      </form>
    </AuthShell>
  )
}
