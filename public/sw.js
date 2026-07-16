// Minimal service worker so RentLoja is installable and works offline-ish.
// Same-origin only — never touches the API / Supabase / fonts (cross-origin).
const CACHE = 'rentloja-v2'

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
