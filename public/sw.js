// Minimal service worker so RentLoja is installable, works offline-ish, and can
// raise pop-up notifications.
// Same-origin only — never touches the API / Supabase / fonts (cross-origin).
const CACHE = 'rentloja-v5'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // leave API/CDN requests alone
  // Auth-critical pages must never be served from cache.
  if (url.pathname.startsWith('/reset-password') || url.pathname.startsWith('/admin')) return

  // Navigations: network-first (so new deploys land), fall back to cached shell.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req)
        const c = await caches.open(CACHE)
        c.put('/', res.clone())
        return res
      } catch {
        return (await caches.match('/')) || Response.error()
      }
    })())
    return
  }

  // Static assets (Vite hashes them): cache-first.
  e.respondWith((async () => {
    const cached = await caches.match(req)
    if (cached) return cached
    try {
      const res = await fetch(req)
      if (res.ok) { const c = await caches.open(CACHE); c.put(req, res.clone()) }
      return res
    } catch {
      return cached || Response.error()
    }
  })())
})

// ── Pop-up notifications ───────────────────────────────────────────────────
// The push service wakes this worker even when RentLoja is closed. Every push
// MUST show a notification: browsers permit a small number of silent pushes and
// then revoke the permission entirely, so we always fall back to a generic
// message rather than showing nothing.
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = {} }

  const title = d.title || 'RentLoja'
  const options = {
    body: d.body || 'You have a new notification.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',          // monochrome silhouette in the Android status bar
    data: { url: d.url || '/' },
    // Same tag replaces the previous pop-up instead of stacking — a tenant
    // reminded twice about one month should see one notification, not two.
    tag: d.tag || 'rentloja',
    renotify: !!d.tag,
    // Rent that's actually overdue stays on screen until it's acknowledged.
    requireInteraction: d.priority === 'urgent',
  }
  e.waitUntil(self.registration.showNotification(title, options))
})

// Tapping the pop-up focuses an already-open tab (and navigates it) rather than
// opening a second copy of the app.
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const target = e.notification.data?.url || '/'
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.focus()
        if ('navigate' in c) { try { await c.navigate(target) } catch { /* focus alone is fine */ } }
        return
      }
    }
    await self.clients.openWindow(target)
  })())
})
