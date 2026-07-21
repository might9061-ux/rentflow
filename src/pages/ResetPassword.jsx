import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../context/ToastContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { db, DEMO_MODE } from '../lib/db.js'
import { supabase } from '../lib/supabaseClient.js'
import { friendlyError } from '../lib/errors.js'
import AuthShell from './AuthShell.jsx'
import { PasswordInput } from '../components/Field.jsx'
import { Spinner } from '../components/ui.jsx'

// Landing page for the Supabase password-recovery email link.
//
// The link carries the recovery token either in the URL hash (#access_token=…)
// or as ?code=… (PKCE). We wait for that to become a real session BEFORE
// showing the form — otherwise updateUser() fails with "Auth session missing".
export default function ResetPassword() {
  const toast = useToast()
  const nav = useNavigate()
  // The recovery link creates a real session, so by the time the form shows the
  // app already knows whose account this is — use it to route and style.
  const { role, signOut } = useAuth()
  const accent = role === 'tenant' ? 'green' : 'gold'
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(!DEMO_MODE)
  const [ready, setReady] = useState(DEMO_MODE) // demo mode has no real link
  const settled = useRef(false)

  useEffect(() => {
    if (DEMO_MODE || !supabase) return
    let alive = true
    let unsub = null
    const done = (ok) => {
      if (!alive || settled.current) return
      settled.current = true
      setReady(ok); setChecking(false); unsub?.()
    }

    ;(async () => {
      // PKCE-style link: exchange the code for a session.
      const code = new URLSearchParams(window.location.search).get('code')
      if (code) { try { await supabase.auth.exchangeCodeForSession(code) } catch { /* fall through */ } }

      const { data } = await supabase.auth.getSession()
      if (data?.session) return done(true)

      // Hash-style link is processed asynchronously — listen briefly for it.
      const sub = supabase.auth.onAuthStateChange((_evt, session) => { if (session) done(true) })
      unsub = () => sub.data.subscription.unsubscribe()
      setTimeout(() => done(false), 4000)
    })()

    return () => { alive = false; unsub?.() }
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (pw.length < 6) return toast.error('Too short', 'Use at least 6 characters.')
    if (pw !== pw2) return toast.error('Passwords don’t match')
    setBusy(true)
    try {
      await db.completePasswordReset(null, null, pw)
      // Work out which sign-in this account belongs to BEFORE signing out.
      let r = role
      if (!r) { try { r = (await db.resolveSession())?.role } catch { /* fall back below */ } }
      const dest = r === 'tenant' ? '/tenant/login' : r === 'manager' ? '/manager/auth' : '/'
      // A reset link must not silently log anyone in — end the recovery session
      // and send them to sign in fresh with the new password.
      try { await signOut() } catch { /* ignore */ }
      toast.success('Password updated', 'Please sign in with your new password.')
      nav(dest, { replace: true })
    } catch (err) { toast.error('Could not reset password', friendlyError(err)); setBusy(false) }
  }

  if (checking) {
    return (
      <AuthShell accent={accent} eyebrow="Account recovery" title="Checking your link" subtitle="One moment…">
        <div className="center" style={{ padding: 24 }}><Spinner /></div>
      </AuthShell>
    )
  }

  if (!ready) {
    return (
      <AuthShell accent={accent} eyebrow="Account recovery" title="Link expired"
        subtitle="This password reset link is no longer valid.">
        <p className="muted" style={{ fontSize: '0.9rem' }}>
          Reset links can only be used once and expire after a short time. Go back to the sign-in screen,
          choose <b style={{ color: 'var(--text)' }}>Forgot password?</b>, and we’ll email you a fresh link.
        </p>
        <button className="btn primary block lg" style={{ marginTop: 16 }} onClick={() => nav('/')}>Back to sign in</button>
      </AuthShell>
    )
  }

  return (
    <AuthShell accent={accent} eyebrow="Account recovery" title="Set a new password"
      subtitle="Choose a new password for your RentLoja account.">
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
