import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'

import { requireAuth } from './auth.js'
import admin from './routes/admin.js'
import managers from './routes/managers.js'
import properties from './routes/properties.js'
import tenants from './routes/tenants.js'
import payments from './routes/payments.js'
import notifications from './routes/notifications.js'
import maintenance from './routes/maintenance.js'
import expenses from './routes/expenses.js'
import reminders from './routes/reminders.js'
import subscriptions from './routes/subscriptions.js'
import payroll from './routes/payroll.js'
import refunds from './routes/refunds.js'
import tenantQuestions from './routes/tenantQuestions.js'
import otp from './routes/otp.js'
import platform from './routes/platform.js'
import paynowResult from './routes/paynowResult.js'
import loginEvents from './routes/loginEvents.js'

const app = express()
const PORT = process.env.PORT || 8787

// Origins allowed to call the API from a browser. Always include local dev and
// the deployed frontend; extra origins can be added via CORS_ORIGINS. Any
// *.vercel.app origin (preview/prod deploys of this app) is also accepted.
const baseOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'https://rentflow-weld.vercel.app', 'https://wwwrentflow.com', 'https://www.wwwrentflow.com', 'https://rentloja.com', 'https://www.rentloja.com']
const envOrigins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
const origins = Array.from(new Set([...baseOrigins, ...envOrigins]))

app.use(cors({
  credentials: true,
  origin(origin, cb) {
    // Non-browser callers (curl, server-to-server) send no Origin — allow them.
    if (!origin) return cb(null, true)
    if (origins.includes(origin) || /\.vercel\.app$/.test(new URL(origin).hostname)) return cb(null, true)
    cb(new Error(`Origin not allowed by CORS: ${origin}`))
  },
}))
app.use(express.json({ limit: '5mb' }))
// Paynow posts its result callback as form-encoded, not JSON.
app.use(express.urlencoded({ extended: false }))
app.use(morgan('dev'))

// Public health check (no auth) — used to confirm the server is up.
app.get('/health', (_req, res) => res.json({ ok: true, service: 'rentflow-api', ts: Date.now() }))

// Paynow's server-to-server callback. PUBLIC on purpose (Paynow holds no token)
// — it authenticates itself by a hash keyed to the workspace's integration key.
app.use('/paynow', paynowResult)

// Everything below requires a valid Supabase session token.
app.use('/api', requireAuth)
app.use('/api/admin', admin)
app.use('/api/managers', managers)
app.use('/api/properties', properties)
app.use('/api/tenants', tenants)
app.use('/api/payments', payments)
app.use('/api/notifications', notifications)
app.use('/api/maintenance', maintenance)
app.use('/api/expenses', expenses)
app.use('/api/reminders', reminders)
app.use('/api/subscriptions', subscriptions)
app.use('/api/payroll', payroll)
app.use('/api/refunds', refunds)
app.use('/api/tenant-questions', tenantQuestions)
app.use('/api/otp', otp)
app.use('/api/platform', platform)
app.use('/api/login-events', loginEvents)

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

app.listen(PORT, () => {
  console.log(`\n[rentflow-api] listening on http://localhost:${PORT}`)
  console.log(`[rentflow-api] allowed origins: ${origins.join(', ')}\n`)
})
