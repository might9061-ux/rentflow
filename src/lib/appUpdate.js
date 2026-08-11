// Recover from a stale deploy.
//
// The app is code-split: each page loads its own hashed JS file on demand. When
// a new version is deployed, those files get new names and the old ones are
// removed from the server. A device still running the OLD app (an open tab, or a
// cached shell) then asks for a code file that no longer exists — the import
// fails and the app would crash with "Reload RentLoja".
//
// Instead of crashing, we reload ONCE to fetch the fresh build. Guarded by a
// short time window so a genuinely broken deploy can't reload in a loop.

import { lazy } from 'react'

const RELOAD_KEY = 'rl_stale_reload_at'
const WINDOW_MS = 10000

// True when an error is a failed dynamic import of a code chunk (a stale build),
// not a real bug in the page.
export function isChunkLoadError(err) {
  const msg = (err && (err.message || String(err))) || ''
  return /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk \S+ failed|error loading dynamically imported module/i.test(msg)
}

// Wraps React.lazy so that a dynamic import returning undefined (stale build —
// the old chunk URL 404s and Vite resolves to undefined instead of throwing a
// recognisable ChunkLoadError) is turned into an explicit ChunkLoadError. This
// lets isChunkLoadError / reloadForStaleBuild handle it correctly.
export function safeLazy(importFn) {
  return lazy(() =>
    importFn().then(mod => {
      if (!mod || mod.default == null) {
        throw new Error('ChunkLoadError: module resolved to undefined (stale build)')
      }
      return mod
    })
  )
}

// Reload once to pick up the new version. Returns true if a reload was triggered.
export function reloadForStaleBuild() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
    if (Date.now() - last < WINDOW_MS) return false // already tried just now — don't loop
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch { /* storage blocked — still attempt a single reload */ }
  window.location.reload()
  return true
}
