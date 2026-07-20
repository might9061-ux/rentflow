import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { db } from '../../lib/db.js'
import { fmtDate } from '../../lib/format.js'
import * as mfa from '../../lib/mfa.js'
import { BILLING_EMAIL, BILLING_WHATSAPP, BILLING_NOTE } from '../../lib/platformContact.js'
import { Spinner } from '../../components/ui.jsx'
import MfaSetup from '../../components/MfaSetup.jsx'
import ChangePasswordModal from '../../components/ChangePasswordModal.jsx'
import { IconShield, IconKey, IconUsers, IconWarn, IconCheck, IconWallet } from '../../components/icons.jsx'

const API_URL = import.meta.env.VITE_API_URL?.trim() || ''

// Settings for the platform owner. The admin console previously had no route to
// account settings at all, so two-factor was unreachable from here.
export default function AdminSettings() {
  const { profile } = useAuth()
  const [showMfa, setShowMfa] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [mfaOn, setMfaOn] = useState(null)
  const [admins, setAdmins] = useState(null)
  const [api, setApi] = useState({ state: 'checking' })

  const loadMfa = async () => { try { setMfaOn(await mfa.isEnrolled()) } catch { setMfaOn(false) } }

  useEffect(() => { loadMfa() }, [])
  useEffect(() => { (async () => {
    try { setAdmins(await db.adminAdmins()) } catch { setAdmins([]) }
  })() }, [])
  useEffect(() => { (async () => {
    if (!API_URL) return setApi({ state: 'none' })
    const t0 = performance.now()
    try {
      const r = await fetch(`${API_URL}/health`)
      const ms = Math.round(performance.now() - t0)
      setApi(r.ok ? { state: 'up', ms } : { state: 'down', code: r.status })
    } catch { setApi({ state: 'down' }) }
  })() }, [])

  const extraAdmins = (admins || []).filter((a) => a.email !== profile?.email)
  const suspicious = (admins || []).filter((a) => a.suspicious)

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">Platform</div>
        <h1>Settings</h1>
        <p>Your account security, who can reach this console, and how landlords pay you.</p>
      </div>

      {/* ── Security ─────────────────────────────────────────────────────── */}
      <div className="card pad set-card">
        <h3>Security</h3>
        <p className="muted set-sub">This account can see every workspace on the platform.</p>

        <div className="set-row">
          <div className="row gap">
            <span className={`set-ico ${mfaOn ? 'good' : 'warn'}`}><IconShield size={16} /></span>
            <div>
              <div style={{ fontWeight: 600 }}>Two-factor authentication</div>
              <div className="muted set-hint">
                {mfaOn === null ? 'Checking…'
                  : mfaOn ? 'On — a code from your phone is required at sign-in.'
                  : 'Off — your password alone protects the whole platform.'}
              </div>
            </div>
          </div>
          <button className={mfaOn ? 'btn ghost sm' : 'btn primary sm'} onClick={() => setShowMfa(true)}>
            {mfaOn ? 'Manage' : 'Turn on'}
          </button>
        </div>

        <div className="set-row">
          <div className="row gap">
            <span className="set-ico"><IconKey size={16} /></span>
            <div>
              <div style={{ fontWeight: 600 }}>Password</div>
              <div className="muted set-hint">Use a long one, not reused anywhere else.</div>
            </div>
          </div>
          <button className="btn ghost sm" onClick={() => setShowPw(true)}>Change</button>
        </div>
      </div>

      {/* ── Who has access ───────────────────────────────────────────────── */}
      <div className="card pad set-card">
        <h3>App owners</h3>
        <p className="muted set-sub">Accounts that can open this console. Should normally be just you.</p>

        {admins === null ? <div className="center" style={{ minHeight: 60 }}><Spinner /></div> : (
          <>
            {suspicious.length > 0 && (
              <div className="set-alert">
                <IconWarn size={15} />
                <span><b>{suspicious.length} account{suspicious.length > 1 ? 's look' : ' looks'} like leftover test data.</b> Test accounts should never hold owner access — tell your developer to remove {suspicious.length > 1 ? 'them' : 'it'}.</span>
              </div>
            )}
            {extraAdmins.length > 0 && suspicious.length === 0 && (
              <div className="set-alert">
                <IconWarn size={15} />
                <span>There {extraAdmins.length > 1 ? 'are' : 'is'} <b>{extraAdmins.length} other account{extraAdmins.length > 1 ? 's' : ''}</b> with owner access. If you didn’t grant {extraAdmins.length > 1 ? 'them' : 'it'}, treat that as a breach.</span>
              </div>
            )}
            {admins.map((a) => (
              <div key={a.id} className="set-row">
                <div className="row gap">
                  <span className={`set-ico ${a.suspicious ? 'warn' : 'good'}`}>
                    {a.suspicious ? <IconWarn size={16} /> : <IconCheck size={16} />}
                  </span>
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {a.email} {a.email === profile?.email && <span className="pill neutral" style={{ marginLeft: 6 }}>you</span>}
                    </div>
                    <div className="muted set-hint">{a.name} · since {fmtDate(a.created_at)}</div>
                  </div>
                </div>
              </div>
            ))}
            {admins.length === 1 && (
              <p className="muted set-hint" style={{ marginTop: 10 }}>
                ✓ Exactly one owner — that’s what you want.
              </p>
            )}
          </>
        )}
      </div>

      {/* ── How landlords pay you ────────────────────────────────────────── */}
      <div className="card pad set-card">
        <h3>Payment details shown to landlords</h3>
        <p className="muted set-sub">What a landlord sees when they choose a plan. Change these in Vercel → Environment Variables, then redeploy.</p>

        <div className="set-row">
          <div><div style={{ fontWeight: 600 }}>Payment instructions</div>
            <div className="muted set-hint">{BILLING_NOTE || <em>Not set — they’re told “using the details we send you”.</em>}</div></div>
          <code className="set-var">VITE_BILLING_NOTE</code>
        </div>
        <div className="set-row">
          <div><div style={{ fontWeight: 600 }}>WhatsApp</div>
            <div className="muted set-hint">{BILLING_WHATSAPP || <em>Not set — no WhatsApp button is shown.</em>}</div></div>
          <code className="set-var">VITE_BILLING_WHATSAPP</code>
        </div>
        <div className="set-row">
          <div><div style={{ fontWeight: 600 }}>Email</div>
            <div className="muted set-hint">{BILLING_EMAIL}</div></div>
          <code className="set-var">VITE_BILLING_EMAIL</code>
        </div>
      </div>

      {/* ── System ───────────────────────────────────────────────────────── */}
      <div className="card pad set-card">
        <h3>System</h3>
        <p className="muted set-sub">A quick check that the pieces are talking to each other.</p>

        <div className="set-row">
          <div className="row gap">
            <span className={`set-ico ${api.state === 'up' ? 'good' : api.state === 'checking' ? '' : 'warn'}`}><IconWallet size={16} /></span>
            <div>
              <div style={{ fontWeight: 600 }}>API server</div>
              <div className="muted set-hint">
                {api.state === 'checking' ? 'Checking…'
                  : api.state === 'up' ? `Responding in ${api.ms}ms${api.ms > 3000 ? ' — it was asleep and just woke up' : ''}`
                  : api.state === 'none' ? 'Not configured'
                  : 'Not responding — landlords may see errors'}
              </div>
            </div>
          </div>
          <span className={`pill ${api.state === 'up' ? 'ok' : api.state === 'checking' ? 'neutral' : 'rejected'}`}>
            {api.state === 'up' ? 'Online' : api.state === 'checking' ? '…' : 'Offline'}
          </span>
        </div>

        <div className="set-row">
          <div><div style={{ fontWeight: 600 }}>Signed in as</div>
            <div className="muted set-hint">{profile?.email}</div></div>
          <span className="pill neutral"><IconUsers size={12} /> App owner</span>
        </div>
      </div>

      {showMfa && <MfaSetup onClose={() => { setShowMfa(false); loadMfa() }} />}
      {showPw && <ChangePasswordModal onClose={() => setShowPw(false)} />}

      <style>{`
        .set-card { margin-bottom: 18px; }
        .set-card h3 { margin: 0; }
        .set-sub { font-size: 0.84rem; margin: 4px 0 14px; }
        .set-row { display: flex; justify-content: space-between; align-items: center; gap: 12px;
          padding: 13px 0; border-top: 1px solid var(--line-soft); flex-wrap: wrap; }
        .set-hint { font-size: 0.82rem; margin-top: 2px; }
        .set-ico { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center;
          background: var(--surface-2); border: 1px solid var(--line); color: var(--text-dim); flex-shrink: 0; }
        .set-ico.good { background: var(--green-bg); border-color: var(--green-line); color: var(--green); }
        .set-ico.warn { background: var(--gold-bg); border-color: var(--gold-line); color: var(--gold); }
        .set-alert { display: flex; gap: 9px; align-items: flex-start; padding: 12px 14px; margin-bottom: 6px;
          border: 1px solid var(--gold-line); background: var(--gold-bg); border-radius: var(--radius); font-size: 0.86rem; }
        .set-alert svg { color: var(--gold); flex-shrink: 0; margin-top: 2px; }
        .set-var { font-size: 0.72rem; color: var(--text-faint); background: var(--surface-2);
          padding: 3px 7px; border-radius: 5px; border: 1px solid var(--line-soft); white-space: nowrap; }
      `}</style>
    </>
  )
}
