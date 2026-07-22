import { useState, useEffect } from 'react'
import Modal from './Modal.jsx'
import { useToast } from '../context/ToastContext.jsx'
import * as unlock from '../lib/quickUnlock.js'
import { db } from '../lib/db.js'
import { IconKey, IconShield, IconCheck } from './icons.jsx'

// Offered once after a fresh password login: secure THIS device with a
// fingerprint/Face ID passkey and/or a short PIN for faster future sign-ins.
export default function QuickUnlockSetup({ meta, onClose }) {
  const toast = useToast()
  const [bioOk, setBioOk] = useState(false)
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [busy, setBusy] = useState(false)
  const [pinSaved, setPinSaved] = useState(unlock.hasPin(meta.userId))
  const [bioSaved, setBioSaved] = useState(unlock.hasBiometric(meta.userId))

  useEffect(() => { unlock.biometricAvailable().then(setBioOk) }, [])

  // Save the current session token so unlock can revive it later without a password.
  const stash = async () => {
    try { const t = await db.currentSessionTokens(); if (t) unlock.stashTokens(meta.userId, t) } catch { /* non-fatal */ }
  }
  const savePin = async () => {
    if (!/^\d{4,6}$/.test(pin)) return toast.error('PIN must be 4–6 digits')
    if (pin !== pin2) return toast.error('PINs don’t match')
    setBusy(true)
    try { await unlock.setPin(meta, pin); await stash(); setPinSaved(true); setPin(''); setPin2(''); toast.success('App PIN set for this device') }
    finally { setBusy(false) }
  }
  const enableBio = async () => {
    setBusy(true)
    try { await unlock.registerBiometric(meta); await stash(); setBioSaved(true); toast.success('Fingerprint / Face ID enabled') }
    catch (e) { toast.error('Could not enable biometric', e.message) }
    finally { setBusy(false) }
  }

  const done = pinSaved
  return (
    <Modal title="Secure this device" onClose={onClose}
      footer={<button className="btn ghost" onClick={onClose}>{done ? 'Done' : 'Not now'}</button>}>
      <p className="muted" style={{ marginBottom: 16 }}>
        Next time you open RentLoja on this device, unlock quickly without re-typing your password.
      </p>

      {/* PIN first: it is the prerequisite, because it is the only thing that
          still works when a fingerprint doesn't. */}
      <div className="ql-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 11 }}>
        <div className="row gap">
          <span className="ql-ico"><IconKey size={18} /></span>
          <div>
            <div style={{ fontWeight: 600 }}>App PIN {pinSaved && <span className="pill ok" style={{ marginLeft: 6 }}><IconCheck size={12} /> Set</span>}</div>
            <div className="muted" style={{ fontSize: '0.8rem' }}>A 4–6 digit code{bioOk ? ' — and your fallback if biometrics fail' : ''}.</div>
          </div>
        </div>
        <div className="field-row">
          <input className="input" inputMode="numeric" maxLength={6} placeholder="PIN" value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          <input className="input" inputMode="numeric" maxLength={6} placeholder="Confirm" value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} />
        </div>
        <button className="btn sm primary block" disabled={busy || !pin} onClick={savePin}>{pinSaved ? 'Update PIN' : 'Set PIN'}</button>
      </div>

      {bioOk && (
        <div className="ql-card">
          <div className="row gap">
            <span className="ql-ico" style={{ opacity: pinSaved ? 1 : 0.5 }}><IconShield size={18} /></span>
            <div>
              <div style={{ fontWeight: 600 }}>Fingerprint / Face ID</div>
              <div className="muted" style={{ fontSize: '0.8rem' }}>
                {pinSaved ? 'Use your phone’s biometrics.' : 'Set your PIN above first.'}
              </div>
            </div>
          </div>
          {bioSaved ? <span className="pill ok"><IconCheck size={12} /> On</span>
            : <button className="btn sm primary" disabled={busy || !pinSaved} onClick={enableBio}>Enable</button>}
        </div>
      )}

      <style>{`
        .ql-card { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:13px 15px; border:1px solid var(--line); border-radius:var(--radius); margin-bottom:12px; }
        .ql-ico { width:36px; height:36px; border-radius:9px; display:grid; place-items:center; background:var(--accent-bg); border:1px solid var(--accent-line); color:var(--accent); flex-shrink:0; }
      `}</style>
    </Modal>
  )
}
