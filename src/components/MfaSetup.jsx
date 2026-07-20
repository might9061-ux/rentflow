import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import { useToast } from '../context/ToastContext.jsx'
import * as mfa from '../lib/mfa.js'
import { Spinner } from './ui.jsx'
import { IconShield, IconCheck, IconTrash } from './icons.jsx'

// Enrol / remove an authenticator app for this account.
//
// The new factor stays inactive until a valid code is entered, so an abandoned
// setup can never lock the account out.
export default function MfaSetup({ onClose }) {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [factors, setFactors] = useState([])
  const [enrol, setEnrol] = useState(null) // { factorId, qr, secret }
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  const refresh = async () => {
    try { setFactors((await mfa.listFactors()).verified) } catch (e) { toast.error('Could not load', e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  const start = async () => {
    setBusy(true)
    try { setEnrol(await mfa.beginEnrol()) }
    catch (e) { toast.error('Could not start setup', e.message) }
    finally { setBusy(false) }
  }

  const confirm = async (e) => {
    e?.preventDefault()
    setBusy(true)
    try {
      await mfa.confirmEnrol(enrol.factorId, code)
      setEnrol(null); setCode('')
      await refresh()
      toast.success('Two-factor is on', 'You’ll need a code from your app each time you sign in.')
    } catch (err) { toast.error('Couldn’t verify', err.message) }
    finally { setBusy(false) }
  }

  const remove = async (id) => {
    setBusy(true)
    try { await mfa.removeFactor(id); await refresh(); toast.info('Two-factor removed', 'Your password alone now protects this account.') }
    catch (e) { toast.error('Could not remove', e.message) }
    finally { setBusy(false) }
  }

  return (
    <Modal title="Two-factor authentication" onClose={onClose}
      footer={<button className="btn ghost" onClick={onClose}>Close</button>}>
      {loading ? <div className="center" style={{ minHeight: 120 }}><Spinner /></div> : (
        <>
          {factors.length > 0 && !enrol && (
            <>
              <div className="mfa-on">
                <IconCheck size={16} />
                <div>
                  <div style={{ fontWeight: 600 }}>Two-factor is on</div>
                  <div className="muted" style={{ fontSize: '0.82rem' }}>A code from your authenticator app is required at sign-in.</div>
                </div>
              </div>
              {factors.map((f) => (
                <div key={f.id} className="spread mfa-row">
                  <span className="muted" style={{ fontSize: '0.86rem' }}>{f.friendly_name || 'Authenticator app'}</span>
                  <button className="btn ghost sm danger" disabled={busy} onClick={() => remove(f.id)}><IconTrash size={14} /> Remove</button>
                </div>
              ))}
              <p className="hint" style={{ marginTop: 12 }}>
                Removing this leaves only your password protecting every workspace on the platform.
              </p>
            </>
          )}

          {factors.length === 0 && !enrol && (
            <>
              <p className="muted" style={{ marginBottom: 14 }}>
                Add a second step at sign-in. Even if someone learns your password, they can’t get in without your phone.
              </p>
              <ol className="mfa-steps">
                <li>Install <b>Google Authenticator</b> or <b>Authy</b> (free).</li>
                <li>Scan the code we show you.</li>
                <li>Enter the 6 digits it displays to confirm.</li>
              </ol>
              <button className="btn primary block lg" disabled={busy} onClick={start} style={{ marginTop: 16 }}>
                <IconShield size={17} /> {busy ? 'Setting up…' : 'Turn on two-factor'}
              </button>
            </>
          )}

          {enrol && (
            <form onSubmit={confirm}>
              <p className="muted" style={{ marginBottom: 12 }}>Scan this with your authenticator app:</p>
              {enrol.qr && (
                <div className="mfa-qr" dangerouslySetInnerHTML={{ __html: enrol.qr }} />
              )}
              <button type="button" className="link-btn" style={{ fontSize: '0.84rem' }} onClick={() => setShowSecret((s) => !s)}>
                {showSecret ? 'Hide' : 'Can’t scan? Enter this code manually'}
              </button>
              {showSecret && <div className="mfa-secret mono">{enrol.secret}</div>}

              <label style={{ display: 'block', fontSize: '0.84rem', color: 'var(--text-dim)', margin: '16px 0 6px' }}>
                Enter the 6-digit code from the app
              </label>
              <input className="input mono" inputMode="numeric" maxLength={6} autoFocus placeholder="123456"
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                style={{ fontSize: '1.3rem', letterSpacing: '0.3em', textAlign: 'center' }} />
              <button className="btn primary block lg" disabled={busy || code.length < 6} style={{ marginTop: 12 }}>
                {busy ? 'Checking…' : 'Confirm'}
              </button>
              <button type="button" className="link-btn" style={{ marginTop: 10, fontSize: '0.84rem' }}
                onClick={() => { setEnrol(null); setCode('') }}>Cancel</button>
            </form>
          )}
        </>
      )}

      <style>{`
        .mfa-on { display: flex; gap: 10px; align-items: flex-start; padding: 13px 15px; margin-bottom: 12px;
          border: 1px solid var(--green-line); background: var(--green-bg); border-radius: var(--radius); }
        .mfa-on svg { color: var(--green); flex-shrink: 0; margin-top: 2px; }
        .mfa-row { padding: 11px 0; border-top: 1px solid var(--line-soft); }
        .mfa-steps { margin: 0; padding-left: 20px; display: grid; gap: 7px; font-size: 0.9rem; color: var(--text-dim); }
        .mfa-steps b { color: var(--text); }
        .mfa-qr { display: grid; place-items: center; padding: 14px; background: #fff; border-radius: var(--radius);
          border: 1px solid var(--line); margin-bottom: 10px; }
        .mfa-qr svg { width: 190px; height: 190px; }
        .mfa-secret { margin-top: 8px; padding: 10px 12px; background: var(--surface-2); border: 1px solid var(--line);
          border-radius: var(--radius-sm); font-size: 0.84rem; word-break: break-all; }
      `}</style>
    </Modal>
  )
}
