import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Stamp the service worker's cache name with a unique build id at build time.
// public/sw.js ships a literal `rentloja-__BUILD_ID__`; here we replace it in the
// built dist/sw.js with a per-build value. Because the SW's `activate` handler
// deletes every cache except the current one, each deploy purges the previous
// build's cached assets — so devices can't keep serving a stale version.
function stampServiceWorker() {
  return {
    name: 'rentflow-stamp-sw',
    apply: 'build',
    closeBundle() {
      const id = Date.now().toString(36)
      const p = resolve('dist', 'sw.js')
      try {
        const src = readFileSync(p, 'utf8')
        if (src.includes('__BUILD_ID__')) {
          writeFileSync(p, src.replace(/__BUILD_ID__/g, id))
          console.log(`[rentflow] service worker cache stamped: rentloja-${id}`)
        }
      } catch { /* no dist/sw.js (e.g. SSR build) — nothing to stamp */ }
    },
  }
}

// ── Local Claude endpoint ────────────────────────────────────────────────────
// Exposes POST /api/assistant during `npm run dev` (and `vite preview`). It
// forwards to the Anthropic API using a SERVER-SIDE key (ANTHROPIC_API_KEY in
// .env.local — note: NOT prefixed with VITE_, so it never ships to the browser).
// This lets the AI copilots use real Claude locally without standing up Supabase.
// If no key is set it returns 503 and the app falls back to the grounded
// demo assistant, so nothing breaks.
function claudeAssistant(env) {
  const KEY = env.ANTHROPIC_API_KEY
  const MODEL = env.ANTHROPIC_MODEL || 'claude-opus-4-8'
  return {
    name: 'rentflow-claude-assistant',
    configureServer(server) {
      server.middlewares.use('/api/assistant', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        const json = (code, obj) => {
          res.statusCode = code
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(obj))
        }
        try {
          if (!KEY) return json(503, { error: 'ANTHROPIC_API_KEY not set — using demo assistant.' })
          const body = await readJson(req)
          const { system, messages, max_tokens = 1024 } = body
          const r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': KEY,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({ model: MODEL, max_tokens, system, messages }),
          })
          const data = await r.json()
          if (!r.ok) return json(r.status, { error: data?.error?.message || 'Claude request failed' })
          const reply = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
          json(200, { reply })
        } catch (e) {
          json(500, { error: String(e?.message || e) })
        }
      })
    },
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (c) => { raw += c })
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}) } catch (e) { reject(e) } })
    req.on('error', reject)
  })
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), claudeAssistant(env), stampServiceWorker()],
    server: {
      port: 5173,
      open: true,
    },
  }
})
