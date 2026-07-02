import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

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
    plugins: [react(), claudeAssistant(env)],
    server: {
      port: 5173,
      open: true,
    },
  }
})
