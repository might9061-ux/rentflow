import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { db } from '../lib/db.js'
import { setActiveCurrency } from '../lib/format.js'
import { currencyByCode, marketFor } from '../lib/markets.js'
import { stashTokens } from '../lib/quickUnlock.js'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null) // { userId, role }
  const [profile, setProfile] = useState(null)  // manager or tenant row

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
    const unsubTokens = db.onSessionTokens((userId, tokens) => stashTokens(userId, tokens))
    return () => { alive = false; unsub && unsub(); unsubTokens && unsubTokens() }
  }, [refresh])

  const value = {
    loading, session, profile,
    userId: session?.userId || null,
    role: session?.role || null,
    refresh,

    async signInManager(creds) { await db.signInManager(creds); await refresh() },
    async signUpManager(data) { const r = await db.signUpManager(data); await refresh(); return r },
    async resendVerification(email) { return db.resendVerification(email) },
    async signInTenant(creds) { const r = await db.signInTenant(creds); await refresh(); return r },
    async quickUnlock({ userId, role, tokens }) { await db.quickUnlockSession({ userId, role, tokens }); await refresh() },
    async signOut() { await db.signOut(); setSession(null); setProfile(null) },
  }

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}
