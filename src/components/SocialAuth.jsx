import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { DEMO_MODE } from '../lib/db.js'
import { friendlyError } from '../lib/errors.js'

// Google's 4-colour "G".
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  )
}

// Social sign-in — MANAGER-ONLY. Rendered on the manager auth screen for both
// sign-in and sign-up (OAuth is one flow for both). Hidden in demo mode, where
// there's no Supabase to broker the redirect.
//
// Google only for now — Apple needs a paid Apple Developer account. To add Apple
// later: re-add an AppleIcon and a second button calling go('apple').
export default function SocialAuth() {
  const { signInWithProvider } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(null) // which provider is launching

  if (DEMO_MODE) return null

  const go = async (provider) => {
    setBusy(provider)
    try {
      await signInWithProvider(provider) // navigates away to the provider on success
    } catch (err) {
      toast.error('Could not continue', friendlyError(err))
      setBusy(null)
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div className="sa-or"><span>or</span></div>
      <button type="button" className="btn ghost block" onClick={() => go('google')} disabled={!!busy}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <GoogleIcon /> {busy === 'google' ? 'Redirecting…' : 'Continue with Google'}
      </button>
      <style>{`
        .sa-or { display: flex; align-items: center; gap: 12px; margin: 4px 0 14px; color: var(--text-faint); font-size: 0.8rem; }
        .sa-or::before, .sa-or::after { content: ''; flex: 1; height: 1px; background: var(--line); }
      `}</style>
    </div>
  )
}
