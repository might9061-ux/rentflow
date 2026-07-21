import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import OtpInput from './OtpInput.jsx'
import { IconMail, IconShield } from './icons.jsx'

// The mandatory "enter the code we just emailed you" step, shown after a
// password check succeeds but before a session exists. Shared by manager,
// tenant, and admin sign-in — the only differences between them are already
// handled by the caller (which `challenge` came back from which role).
export default function LoginOtpStep({ challenge, onVerified, onBack }) {
  const { verifyLoginOtp, resendLoginOtp } = useAuth()
  const toast = useToast()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [resent, setResent] = useState(false)

  const verify = async (e) => {
    e?.preventDefault()
    setBusy(true)
    try {
      const r = await verifyLoginOtp({ challengeId: challenge.challenge_id, code })
      onVerified(r)
    } catch (err) {
      toast.error('Incorrect code', err.message)
      setCode('')
    } finally { setBusy(false) }
  }

  const resend = async () => {
    setBusy(true)
    try { await resendLoginOtp(challenge.challenge_id); setResent(true); toast.success('Code sent', `Check ${challenge.email}.`) }
    catch (err) { toast.error('Could not resend', err.message) }
    finally { setBusy(false) }
  }

  return (
    <form onSubmit={verify}>
      <div className="row gap" style={{ color: 'var(--accent-soft)', marginBottom: 10 }}>
        <IconMail size={17} /><span style={{ fontWeight: 600 }}>Check your email</span>
      </div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 18, fontSize: '0.9rem' }}>
        We sent a 6-digit code to <b>{challenge.email}</b>. Enter it to finish signing in.
      </p>

      {challenge.dev_code && (
        <p className="hint" style={{ marginBottom: 14 }}>Dev fallback (no email configured): <b>{challenge.dev_code}</b></p>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
        <OtpInput value={code} onChange={setCode} />
      </div>

      <button className="btn primary block lg" disabled={busy || code.length < 6}>
        {busy ? 'Verifying…' : 'Verify & sign in'}
      </button>

      <div className="row gap" style={{ justifyContent: 'space-between', marginTop: 14 }}>
        <button type="button" className="link-btn" onClick={onBack} disabled={busy}>Back</button>
        <button type="button" className="link-btn" onClick={resend} disabled={busy}>{resent ? 'Code resent' : 'Resend code'}</button>
      </div>

      <p className="hint row gap" style={{ marginTop: 16 }}>
        <IconShield size={13} /> This code protects your account even if your password leaks — it's required every time you sign in.
      </p>
    </form>
  )
}
