import { useState } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db, DEMO_MODE } from '../../lib/db.js'
import { prettyPhone } from '../../lib/phone.js'
import OtpInput from '../../components/OtpInput.jsx'
import { PasswordInput } from '../../components/Field.jsx'
import { IconMail, IconPhone, IconCheck, IconShield, IconLogout } from '../../components/icons.jsx'

export default function TenantVerify() {
  const { profile, userId, refresh, signOut } = useAuth()
  const toast = useToast()

  const [step, setStep] = useState('verify') // 'verify' | 'password'
  const [emailDone, setEmailDone] = useState(profile?.email_verified || false)
  const [phoneDone, setPhoneDone] = useState(profile?.phone_verified || false)
  const canProceed = emailDone || phoneDone

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }} className="theme-tenant">
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div className="spread" style={{ marginBottom: 18 }}>
          <div className="row gap" style={{ color: 'var(--green)' }}>
            <IconShield size={18} /><span className="eyebrow" style={{ color: 'var(--green)' }}>Account verification</span>
          </div>
          <button className="btn ghost sm" onClick={signOut}><IconLogout size={14} /> Sign out</button>
        </div>

        <div className="card pad">
          {step === 'verify' ? (
            <>
              <h1 style={{ fontSize: '1.9rem' }}>Verify it’s you</h1>
              <p className="muted" style={{ marginTop: 4, marginBottom: 20 }}>
                Confirm your email <b>or</b> phone with a 6-digit code. You can do both.
              </p>

              <ChannelCard
                icon={<IconMail size={18} />} label="Email" target={profile?.email}
                channel="email" tenantId={userId} done={emailDone} onDone={() => setEmailDone(true)}
              />
              <ChannelCard
                icon={<IconPhone size={18} />} label="Phone" target={prettyPhone(profile?.phone)}
                channel="phone" tenantId={userId} done={phoneDone} onDone={() => setPhoneDone(true)}
              />

              <p className="hint row gap" style={{ marginBottom: 10 }}>
                <IconShield size={13} /> Codes are only sent to the email and phone your manager registered for you.
              </p>

              <button className="btn primary block lg" disabled={!canProceed}
                onClick={() => setStep('password')} style={{ marginTop: 0 }}>
                Continue
              </button>
              {!canProceed && <p className="hint" style={{ textAlign: 'center', marginTop: 8 }}>Verify at least one channel to continue.</p>}
            </>
          ) : (
            <SetPassword
              onBack={() => setStep('verify')}
              onDone={async (pw) => {
                await db.setTenantPassword(userId, pw)
                await db.completeFirstLogin(userId)
                toast.success('You’re all set', 'Welcome to RentLoja.')
                await refresh()
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function ChannelCard({ icon, label, target, channel, tenantId, done, onDone }) {
  const toast = useToast()
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const send = async () => {
    setBusy(true)
    try {
      const r = await db.requestOtp(tenantId, channel)
      setSent(true)
      if (DEMO_MODE && r?.code) toast.info(`Demo ${label} code`, `Your code is ${r.code}`)
      else toast.success('Code sent', `Check your ${label.toLowerCase()}.`)
    } catch (e) { toast.error('Could not send code', e.message) }
    finally { setBusy(false) }
  }

  const verify = async () => {
    setBusy(true)
    try {
      const ok = await db.verifyOtp(tenantId, channel, code)
      if (ok) { toast.success(`${label} verified`); onDone() }
      else toast.error('Incorrect code', 'Check the digits and try again.')
    } catch (e) { toast.error('Verification failed', e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="vchannel" style={{ borderColor: done ? 'var(--green-line)' : 'var(--line)' }}>
      <div className="spread">
        <div className="row gap">
          <span className="vico" style={{ color: done ? 'var(--green)' : 'var(--text-dim)' }}>{icon}</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{label}</div>
            <div className="muted" style={{ fontSize: '0.8rem' }}>{target || '—'}</div>
          </div>
        </div>
        {done
          ? <span className="pill ok"><IconCheck size={13} /> Verified</span>
          : !sent
            ? <button className="btn sm" disabled={busy || !target} onClick={send}>Send code</button>
            : null}
      </div>

      {sent && !done && (
        <div style={{ marginTop: 14 }}>
          <OtpInput value={code} onChange={setCode} />
          <div className="row gap" style={{ marginTop: 12, justifyContent: 'center' }}>
            <button className="btn sm ghost" onClick={send} disabled={busy}>Resend</button>
            <button className="btn sm primary" onClick={verify} disabled={busy || code.length < 6}>Verify</button>
          </div>
        </div>
      )}

      <style>{`
        .vchannel { border:1px solid var(--line); border-radius:var(--radius); padding:15px 16px; margin-bottom:14px; transition:border-color .2s; }
        .vico { width:34px;height:34px;border-radius:9px;display:grid;place-items:center;background:var(--surface-2);border:1px solid var(--line); }
      `}</style>
    </div>
  )
}

function SetPassword({ onDone, onBack }) {
  const toast = useToast()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (pw.length < 6) return toast.error('Too short', 'Use at least 6 characters.')
    if (pw !== pw2) return toast.error('Passwords don’t match')
    setBusy(true)
    try { await onDone(pw) } catch (err) { toast.error('Could not set password', err.message); setBusy(false) }
  }

  return (
    <form onSubmit={submit}>
      <h1 style={{ fontSize: '1.9rem' }}>Set your password</h1>
      <p className="muted" style={{ marginTop: 4, marginBottom: 20 }}>
        Choose a permanent password for all future logins.
      </p>
      <PasswordInput label="New password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus required minLength={6} />
      <PasswordInput label="Confirm password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={6} />
      <div className="row gap" style={{ marginTop: 6 }}>
        <button type="button" className="btn ghost" onClick={onBack}>Back</button>
        <button className="btn primary grow lg" disabled={busy}>{busy ? 'Saving…' : 'Finish & enter RentLoja'}</button>
      </div>
    </form>
  )
}
