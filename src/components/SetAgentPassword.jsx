import { useState } from 'react'
import { db } from '../lib/db.js'
import { useToast } from '../context/ToastContext.jsx'
import AuthShell from '../pages/AuthShell.jsx'
import { PasswordInput } from './Field.jsx'
import { IconKey } from './icons.jsx'

// Shown to an invited agent on their first sign-in: they must choose their own
// password, which replaces the manager-issued temporary one and clears
// first_login so the app opens. Until then the app is not reachable.
export default function SetAgentPassword({ userId, onDone }) {
  const toast = useToast()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (pw.length < 6) return toast.error('Too short', 'Use at least 6 characters.')
    if (pw !== pw2) return toast.error('Passwords don’t match', 'Type the same password twice.')
    if (!agreed) return toast.error('Please agree to continue', 'You must accept the Terms and Privacy Policy.')
    setBusy(true)
    try {
      await db.completeAgentFirstLogin(userId, pw)
      toast.success('Password set', 'You’re all set — welcome aboard.')
      onDone()
    } catch (err) {
      toast.error('Could not set password', err.message)
      setBusy(false)
    }
  }

  return (
    <AuthShell accent="gold" eyebrow="Agent setup" title="Set your password"
      subtitle="Choose your own password to finish setting up. The temporary one your manager sent you will stop working.">
      <form onSubmit={submit}>
        <PasswordInput label="New password" value={pw} onChange={(e) => setPw(e.target.value)}
          autoComplete="new-password" autoFocus minLength={6} required />
        <PasswordInput label="Confirm password" value={pw2} onChange={(e) => setPw2(e.target.value)}
          autoComplete="new-password" minLength={6} required />
        <label className="row gap" style={{ margin: '14px 0 2px', fontSize: '0.86rem', cursor: 'pointer', alignItems: 'flex-start' }}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 3 }} />
          <span>I agree to the <a href="/terms" target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>Terms &amp; Conditions</a> and <a href="/privacy" target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>Privacy Policy</a>.</span>
        </label>
        <button className="btn primary block lg" disabled={busy || !agreed} style={{ marginTop: 6 }}>
          <IconKey size={15} /> {busy ? 'Saving…' : 'Set password & continue'}
        </button>
      </form>
    </AuthShell>
  )
}
