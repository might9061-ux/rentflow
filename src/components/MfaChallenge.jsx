import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import * as mfa from '../lib/mfa.js'
import { IconShield, IconLogout } from './icons.jsx'
import Logo from './Logo.jsx'

// Shown when the account has two-factor on but this session is still at AAL1
// (password verified, code not yet). Full-screen: there is nothing useful to
// do until the code is entered.
export default function MfaChallenge({ onVerified }) {
  const { signOut } = useAuth()
  const toast = useToast()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e?.preventDefault()
    setBusy(true)
    try { await mfa.verifyCode(code); onVerified?.() }
    catch (err) { setCode(''); toast.error('Couldn’t verify', err.message); setBusy(false) }
  }

  return (
    <div className="mfa-gate">
      <div className="mfa-gate-inner">
        <div className="brand-mark" style={{ margin: '0 auto 20px' }}><Logo size={30} /></div>
        <h2 style={{ marginBottom: 6 }}>Enter your code</h2>
        <p className="muted" style={{ marginBottom: 22, fontSize: '0.9rem' }}>
          Open your authenticator app and enter the 6 digits for RentLoja.
        </p>
        <form onSubmit={submit}>
          <input className="input mono" inputMode="numeric" maxLength={6} autoFocus placeholder="123456"
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            style={{ fontSize: '1.5rem', letterSpacing: '0.35em', textAlign: 'center' }} />
          <button className="btn primary block lg" disabled={busy || code.length < 6} style={{ marginTop: 14 }}>
            <IconShield size={17} /> {busy ? 'Checking…' : 'Verify'}
          </button>
        </form>
        <p className="hint" style={{ marginTop: 14 }}>Codes change every 30 seconds — use the one showing now.</p>
        <button className="btn ghost sm" onClick={signOut} style={{ marginTop: 18, color: 'var(--text-faint)' }}>
          <IconLogout size={14} /> Sign out
        </button>
      </div>

      <style>{`
        .mfa-gate { position: fixed; inset: 0; z-index: 9998; display: grid; place-items: center;
          padding: 24px; background: var(--bg); }
        .mfa-gate-inner { width: 100%; max-width: 340px; text-align: center; }
      `}</style>
    </div>
  )
}
