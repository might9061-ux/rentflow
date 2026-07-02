import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import * as unlock from '../lib/quickUnlock.js'
import { initials } from '../lib/format.js'
import { IconShield, IconArrowRight, IconX } from './icons.jsx'

// Shown on the landing screen when this device has a saved quick-unlock account.
// Lets the user back in with fingerprint / Face ID or a PIN.
export default function QuickUnlockCard() {
  const { quickUnlock } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const [accounts, setAccounts] = useState(unlock.listAccounts())
  const [active, setActive] = useState(accounts[0] || null)
  const [pin, setPin] = useState('')
  const [bioOk, setBioOk] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => { unlock.biometricAvailable().then(setBioOk) }, [])
  if (!active) return null

  const finish = async (acc) => {
    setBusy(true)
    try {
      await quickUnlock({ userId: acc.userId, role: acc.role })
      nav(acc.role === 'manager' ? '/manager' : '/tenant')
    } catch (e) { toast.error('Could not unlock', e.message); setBusy(false) }
  }
  const withBio = async () => {
    setBusy(true)
    try { await unlock.unlockBiometric(active.userId); await finish(active) }
    catch (e) { toast.error('Unlock failed', e.message); setBusy(false) }
  }
  const withPin = async (e) => {
    e?.preventDefault()
    if (!(await unlock.verifyPin(active.userId, pin))) return toast.error('Wrong PIN')
    finish(active)
  }
  const forget = () => {
    unlock.forgetAccount(active.userId)
    const rest = unlock.listAccounts()
    setAccounts(rest); setActive(rest[0] || null); setPin('')
  }

  const canBio = bioOk && unlock.hasBiometric(active.userId)
  const canPin = unlock.hasPin(active.userId)

  return (
    <div className="ql-welcome">
      <button className="ql-forget" onClick={forget} title="Forget this device" aria-label="Forget"><IconX size={14} /></button>
      <div className="row gap" style={{ marginBottom: 14 }}>
        <div className="avatar" style={{ width: 44, height: 44 }}>{initials(...(active.name || ' ').split(' '))}</div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>Welcome back, {active.name?.split(' ')[0] || 'there'}</div>
          <div className="muted" style={{ fontSize: '0.82rem' }}>{active.role === 'manager' ? 'Manager' : 'Tenant'} · {active.identifier}</div>
        </div>
      </div>

      {canBio && (
        <button className="btn primary block lg" disabled={busy} onClick={withBio} style={{ marginBottom: canPin ? 10 : 0 }}>
          <IconShield size={17} /> Unlock with fingerprint / Face ID
        </button>
      )}

      {canPin && (
        <form onSubmit={withPin} className="row gap" style={{ marginTop: canBio ? 4 : 0 }}>
          <input className="input" inputMode="numeric" maxLength={6} placeholder="Enter app PIN" value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoFocus={!canBio} />
          <button className="btn primary" disabled={busy || pin.length < 4}><IconArrowRight size={16} /></button>
        </form>
      )}

      {accounts.length > 1 && (
        <div className="ql-switch">
          {accounts.filter((a) => a.userId !== active.userId).map((a) => (
            <button key={a.userId} className="link-btn" onClick={() => { setActive(a); setPin('') }}>{a.name}</button>
          ))}
        </div>
      )}

      <style>{`
        .ql-welcome { position: relative; text-align: left; margin-top: 30px; padding: 20px;
          background: var(--bg-raised); border: 1px solid var(--gold-line); border-radius: var(--radius-lg); box-shadow: var(--shadow-soft); }
        .ql-forget { position: absolute; top: 12px; right: 12px; background: transparent; border: none; color: var(--text-faint); }
        .ql-forget:hover { color: var(--text); }
        .ql-switch { margin-top: 12px; display: flex; gap: 12px; flex-wrap: wrap; font-size: 0.82rem; }
      `}</style>
    </div>
  )
}
