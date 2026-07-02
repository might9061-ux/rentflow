import { useState } from 'react'
import { useToast } from '../context/ToastContext.jsx'
import { db, DEMO_MODE } from '../lib/db.js'
import { maskEmail, isValidEmail } from '../lib/format.js'
import { maskPhone } from '../lib/phone.js'
import Modal from '../components/Modal.jsx'
import { Input, EmailInput, PasswordInput } from '../components/Field.jsx'
import OtpInput from '../components/OtpInput.jsx'
import { IconCheckCircle, IconMail, IconPhone } from '../components/icons.jsx'

// "Forgot password" flow shared by manager & tenant auth screens.
// The reset code is only ever delivered to a contact REGISTERED on the
// account — the user identifies the account by email but never types in a
// destination number.
//   • Demo mode  → 6-digit code sent to the chosen registered channel (shown in a toast).
//   • Supabase   → emails a recovery link to the registered address.
export default function ForgotPasswordModal({ accent = 'gold', initialEmail = '', onClose, onReset }) {
  const toast = useToast()
  const [step, setStep] = useState('request') // request | channel | reset | sent
  const [email, setEmail] = useState(initialEmail)
  const [targets, setTargets] = useState(null) // { email, phone }
  const [channel, setChannel] = useState('email')
  const [code, setCode] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)

  // Step 1 — identify the account by its email.
  const lookup = async (e) => {
    e.preventDefault()
    if (!isValidEmail(email)) return toast.error('Invalid email', 'Enter a valid email address.')
    setBusy(true)
    try {
      if (!DEMO_MODE) {
        await db.requestPasswordReset(email)
        setStep('sent')
        return
      }
      const t = await db.lookupResetTargets(email)
      setTargets(t)
      if (t.phone) { setChannel('email'); setStep('channel') }
      else { await sendCode('email') }
    } catch (err) { toast.error('Could not start reset', err.message) }
    finally { setBusy(false) }
  }

  // Send the code to a chosen REGISTERED channel (demo only).
  const sendCode = async (ch) => {
    const r = await db.requestPasswordReset(email, ch)
    toast.info('Demo reset code', `Sent to your registered ${ch}. Code: ${r.code}`)
    setChannel(ch)
    setStep('reset')
  }

  const chooseChannel = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { await sendCode(channel) }
    catch (err) { toast.error('Could not send code', err.message) }
    finally { setBusy(false) }
  }

  // Final — verify code + set new password.
  const reset = async (e) => {
    e.preventDefault()
    if (pw.length < 6) return toast.error('Too short', 'Use at least 6 characters.')
    if (pw !== pw2) return toast.error('Passwords don’t match')
    setBusy(true)
    try {
      await db.completePasswordReset(email, code, pw)
      toast.success('Password updated', 'You can sign in with your new password.')
      onReset?.(email)
      onClose()
    } catch (err) { toast.error('Could not reset password', err.message); setBusy(false) }
  }

  return (
    <div className={accent === 'green' ? 'theme-tenant' : ''}>
      {step === 'request' && (
        <Modal title="Reset your password" onClose={onClose}
          footer={<>
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn primary" form="fp-request" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
          </>}>
          <p className="muted" style={{ marginBottom: 16 }}>
            Enter your account email. {DEMO_MODE
              ? 'A code will be sent only to the email or phone registered on your account.'
              : 'We’ll email a secure reset link to the address registered on your account.'}
          </p>
          <form id="fp-request" onSubmit={lookup}>
            <EmailInput label="Account email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus
              placeholder="you@example.com" />
          </form>
        </Modal>
      )}

      {step === 'channel' && targets && (
        <Modal title="Where should we send the code?" onClose={onClose}
          footer={<>
            <button className="btn ghost" onClick={() => setStep('request')}>Back</button>
            <button className="btn primary" form="fp-channel" disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
          </>}>
          <p className="muted" style={{ marginBottom: 14 }}>
            For security, the code can only go to the contact details on your account.
          </p>
          <form id="fp-channel" onSubmit={chooseChannel}>
            <ChannelOption icon={<IconMail size={16} />} label="Email" value={maskEmail(targets.email)}
              selected={channel === 'email'} onSelect={() => setChannel('email')} />
            <ChannelOption icon={<IconPhone size={16} />} label="Phone (SMS)" value={maskPhone(targets.phone)}
              selected={channel === 'phone'} onSelect={() => setChannel('phone')} />
          </form>
        </Modal>
      )}

      {step === 'reset' && (
        <Modal title="Set a new password" onClose={onClose}
          footer={<>
            <button className="btn ghost" onClick={() => setStep(targets?.phone ? 'channel' : 'request')}>Back</button>
            <button className="btn primary" form="fp-reset" disabled={busy || code.length < 6}>{busy ? 'Saving…' : 'Update password'}</button>
          </>}>
          <p className="muted" style={{ marginBottom: 16 }}>
            Enter the 6-digit code sent to your registered {channel === 'phone' ? 'phone' : 'email'}
            {targets ? <> (<b style={{ color: 'var(--text)' }}>{channel === 'phone' ? maskPhone(targets.phone) : maskEmail(targets.email)}</b>)</> : null}, then choose a new password.
          </p>
          <form id="fp-reset" onSubmit={reset}>
            <div className="field"><label>Reset code</label><OtpInput value={code} onChange={setCode} /></div>
            <PasswordInput label="New password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} />
            <PasswordInput label="Confirm password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={6} />
          </form>
        </Modal>
      )}

      {step === 'sent' && (
        <Modal title="Check your email" onClose={onClose}
          footer={<button className="btn primary" onClick={onClose}>Done</button>}>
          <div className="center" style={{ flexDirection: 'column', gap: 12, padding: '12px 0 4px', textAlign: 'center' }}>
            <span style={{ color: 'var(--accent)' }}><IconCheckCircle size={42} /></span>
            <p className="muted">
              If an account exists for <b style={{ color: 'var(--text)' }}>{maskEmail(email)}</b>, a password-reset link
              is on its way to the registered address. Open it to set a new password.
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ChannelOption({ icon, label, value, selected, onSelect }) {
  return (
    <button type="button" onClick={onSelect}
      className="ch-opt" style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
        padding: '13px 15px', marginBottom: 10, borderRadius: 'var(--radius)', cursor: 'pointer',
        background: selected ? 'var(--accent-bg)' : 'var(--bg)',
        border: `1px solid ${selected ? 'var(--accent-line)' : 'var(--line)'}`, color: 'var(--text)',
      }}>
      <span style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center',
        background: 'var(--surface-2)', border: '1px solid var(--line)', color: selected ? 'var(--accent)' : 'var(--text-dim)' }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{label}</div>
        <div className="muted mono" style={{ fontSize: '0.82rem' }}>{value}</div>
      </div>
      <span style={{ width: 18, height: 18, borderRadius: 99, border: `2px solid ${selected ? 'var(--accent)' : 'var(--line)'}`,
        display: 'grid', placeItems: 'center' }}>
        {selected && <span style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--accent)' }} />}
      </span>
    </button>
  )
}
