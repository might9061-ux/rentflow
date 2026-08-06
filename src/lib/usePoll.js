import { useEffect } from 'react'

// How often live badges / the notification bell refresh, in ms. ONE knob for the
// whole app — lower it for snappier updates (e.g. 5000 = every 5s), raise it to
// cut server load. Below ~5s, prefer Supabase Realtime instead of polling.
export const POLL_MS = 10000

// Re-run `fn` on an interval while the tab is VISIBLE, and immediately whenever
// the tab regains focus — so badges, the notification bell and unread counts
// update live without the user refreshing. It deliberately does nothing while
// the tab is hidden (saves requests/battery); returning to the tab triggers an
// instant refresh, so the user never sees a stale count.
export function usePoll(fn, ms = POLL_MS, deps = []) {
  useEffect(() => {
    if (typeof fn !== 'function') return undefined
    const run = () => { if (document.visibilityState === 'visible') fn() }
    const id = setInterval(run, ms)
    const onVisible = () => { if (document.visibilityState === 'visible') fn() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
