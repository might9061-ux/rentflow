import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { db } from '../lib/db.js'
import { setActiveCurrency } from '../lib/format.js'
import { currencyByCode, marketFor } from '../lib/markets.js'
import { stashTokens, markSignedOut, clearSignedOut } from '../lib/quickUnlock.js'
import { markUnlocked, markLocked } from '../lib/lockState.js'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null) // { userId, role }
  const [profile, setProfile] = useState(null)  // manager or tenant row

  // Tell the API a sign-in happened so it can alert on a new device. Fire and
  // forget: a failure here must never block or fail the sign-in itself.
  const reportLogin = () => { db.reportLogin?.().catch(() => { /* non-fatal */ }) }

  const refresh = useCallback(async () => {
    // Resolving the session must never throw — a backend/network hiccup should
    // drop us to the login screen, not leave the app hanging.
    let s = null
    try { s = await db.resolveSession() } catch { s = null }
    if (!s) { setSession(null); setProfile(null); return }
    try {
      const p = s.role === 'manager' ? await db.getManager(s.userId) : await db.getTenant(s.userId)
      // A session with no loadable profile (e.g. account removed) is unusable —
      // treat it as signed out rather than rendering an endless spinner.
      if (!p) { setSession(null); setProfile(null); return }
      // Managers carry the workspace currency (defaults to their country's local).
      // (Tenants get it from their manager in TenantLayout.)
      if (s.role === 'manager') setActiveCurrency(currencyByCode(p.currency || marketFor(p.country).currency))
      setSession(s); setProfile(p)
    } catch { setSession(null); setProfile(null) }
  }, [])

  useEffect(() => {
    let alive = true
    // Always clear loading, even if refresh rejects, so we never spin forever.
    ;(async () => { try { await refresh() } finally { if (alive) setLoading(false) } })()
    const unsub = db.onAuthChange(() => { refresh() })
    // Keep each secured device's saved token current as Supabase rotates it, so
    // fingerprint / PIN unlock can revive the session later.
    // A live session also means they're back in — undo any dormant flag.
    const unsubTokens = db.onSessionTokens((userId, tokens) => { stashTokens(userId, tokens); clearSignedOut(userId) })
    return () => { alive = false; unsub && unsub(); unsubTokens && unsubTokens() }
  }, [refresh])

  const value = {
    loading, session, profile,
    userId: session?.userId || null,
    role: session?.role || null,
    refresh,

    // Sign-in is two steps wherever the API server brokers it: the password
    // check returns a challenge (a code was just emailed) instead of a
    // session, and verifyLoginOtp finishes it. In demo mode / direct-Supabase
    // mode (no API server to hold tokens server-side) db.signInManager still
    // completes immediately, same as always — detected by the absence of a
    // challenge_id, so callers don't need to know which mode is active.
    // Anyone who finishes sign-in (either way), or a quick unlock, starts the
    // run unlocked — the lock screen is for returning to a running session.
    async signInManager(creds) {
      const r = await db.signInManager(creds)
      if (r?.challenge_id) return r
      markUnlocked(); clearSignedOut(r?.id); reportLogin(); await refresh()
      return r
    },
    async signInTenant(creds) {
      const r = await db.signInTenant(creds)
      if (r?.challenge_id) return r
      markUnlocked(); clearSignedOut(r?.id); reportLogin(); await refresh()
      return r
    },
    async verifyLoginOtp({ challengeId, code }) {
      const r = await db.verifyLoginOtp({ challengeId, code })
      markUnlocked(); clearSignedOut(r?.id); reportLogin(); await refresh()
      return r
    },
    async resendLoginOtp(challengeId) { return db.resendLoginOtp(challengeId) },
    async signUpManager(data) { const r = await db.signUpManager(data); markUnlocked(); await refresh(); return r },
    // Google / Apple, manager-only. Redirects away to the provider; the session
    // is picked up on return by the onAuthChange listener above.
    async signInWithProvider(provider) {
      if (!db.signInWithProvider) throw new Error('Social sign-in isn’t available in this mode.')
      markUnlocked()
      return db.signInWithProvider(provider)
    },
    async resendVerification(email) { return db.resendVerification(email) },
    async quickUnlock({ userId, role, tokens }) { await db.quickUnlockSession({ userId, role, tokens }); markUnlocked(); clearSignedOut(userId); await refresh() },
    // Signing out is deliberate: stop offering password-free re-entry on the
    // landing screen, but keep the PIN/passkey so the lock screen still works
    // once they sign back in.
    async signOut() { markSignedOut(session?.userId); await db.signOut(); markLocked(); setSession(null); setProfile(null) },
  }

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}
