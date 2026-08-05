import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import * as unlock from '../lib/quickUnlock.js'
import { isUnlocked, markUnlocked, markLocked } from '../lib/lockState.js'
import { readBrand, brandDisplay } from '../lib/brand.js'
import { initials } from '../lib/format.js'
import { IconShield, IconArrowRight, IconLogout } from './icons.jsx'
import Logo from './Logo.jsx'

// Banking-app style lock screen (Monzo/Revolut model).
//
// The user STAYS signed in — their session is untouched. We simply cover the
// app whenever it's been backgrounded or freshly opened, and lift the cover
// once they prove it's them with fingerprint / Face ID or their PIN. Because
// nothing is being re-authenticated against the server, this can't fail the way
// restoring an expired session can.
//
// Only engages for accounts that actually secured this device — otherwise a
// user with no PIN or passkey would be locked out with no way back in.
const GRACE_MS = 15_000 // brief app-switches (copying a reference, reading a text) don't re-lock

export default function AppLock() {
  const { session, userId, profile, signOut } = useAuth()
  const toast = useToast()
  // Phones only — never lock on desktop (see isMobileDevice).
  const secured = !!userId && unlock.isMobileDevice() && (unlock.hasPin(userId) || unlock.hasBiometric(userId))

  const [locked, setLocked] = useState(false)
  const [pin, setPin] = useState('')
  const [bioOk, setBioOk] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => { unlock.biometricAvailable().then(setBioOk) }, [])

  // Cold start (or reload) with a restored session → require an unlock.
  useEffect(() => { if (secured && !isUnlocked()) setLocked(true) }, [secured])

  // Re-lock after the app has been in the background for more than the grace window.
  useEffect(() => {
    if (!secured) return
    let hiddenAt = 0
    const onVis = () => {
      if (document.hidden) { hiddenAt = Date.now(); return }
      if (hiddenAt && Date.now() - hiddenAt > GRACE_MS) { markLocked(); setLocked(true); setPin('') }
      hiddenAt = 0
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [secured])

  const open = useCallback(() => { markUnlocked(); setLocked(false); setPin(''); setBusy(false) }, [])

  const withBio = async () => {
    setBusy(true)
    try { await unlock.unlockBiometric(userId); open() }
    catch (e) { toast.error('Unlock failed', e.message); setBusy(false) }
  }
  const withPin = async (e) => {
    e?.preventDefault()
    if (await unlock.verifyPin(userId, pin)) return open()
    setPin(''); toast.error('Wrong PIN')
  }

  // Signed out, no device security set up, or already unlocked → render nothing.
  if (!session || !secured || !locked) return null

  const canBio = bioOk && unlock.hasBiometric(userId)
  const canPin = unlock.hasPin(userId)
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ')
  // Managers carry their brand on their own profile; tenants get their
  // manager's, which the layout cached for us (no network while locked).
  const brand = brandDisplay(
    profile?.brand_name ? { name: profile.brand_name, logo: profile.brand_logo } : readBrand(userId)
  )

  return (
    <div className="applock">
      <div className="applock-inner">
        {brand.logo
          ? <img className="applock-logo" src={brand.logo} alt={brand.name} />
          : <div className="brand-mark" style={{ margin: '0 auto 22px' }}>{brand.custom ? brand.mark : <Logo size={30} />}</div>}
        {name && <div className="avatar applock-av">{initials(...name.split(' '))}</div>}
        <h2 style={{ marginBottom: 4 }}>{name ? `Welcome back, ${name.split(' ')[0]}` : 'Welcome back'}</h2>
        <p className="muted" style={{ marginBottom: 26, fontSize: '0.9rem' }}>
          {brand.name} is locked. Unlock to continue.
        </p>

        {canBio && (
          <button className="btn primary block lg" disabled={busy} onClick={withBio} style={{ marginBottom: canPin ? 14 : 0 }}>
            <IconShield size={18} /> Unlock with fingerprint / Face ID
          </button>
        )}

        {canPin && (
          <form onSubmit={withPin} className="row gap">
            <input className="input" inputMode="numeric" maxLength={6} placeholder="Enter app PIN" value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoFocus={!canBio} />
            <button className="btn primary" disabled={busy || pin.length < 4}><IconArrowRight size={16} /></button>
          </form>
        )}

        <button className="btn ghost sm applock-out" onClick={signOut}>
          <IconLogout size={14} /> Sign out instead
        </button>

        {brand.custom && (
          <div className="applock-credit">
            Powered by <b style={{ color: 'var(--text-dim)' }}>RentLoja</b>
          </div>
        )}
      </div>

      <style>{`
        .applock {
          position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center;
          padding: 24px; background: var(--bg); overscroll-behavior: contain;
        }
        .applock-inner { width: 100%; max-width: 360px; text-align: center; }
        .applock-av { width: 58px; height: 58px; margin: 0 auto 14px; font-size: 1.15rem; }
        .applock-out { margin-top: 22px; color: var(--text-faint); }
        .applock-logo { max-height: 54px; max-width: 190px; object-fit: contain; margin: 0 auto 22px; display: block; }
        .applock-credit { margin-top: 26px; font-size: 0.68rem; color: var(--text-faint); }
      `}</style>
    </div>
  )
}
