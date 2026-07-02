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

const app = express()
const PORT = process.env.PORT || 8787

const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

app.use(cors({ origin: origins, credentials: true }))
app.use(express.json({ limit: '5mb' }))
app.use(morgan('dev'))

// Public health check (no auth) — used to confirm the server is up.
app.get('/health', (_req, res) => res.json({ ok: true, service: 'rentflow-api', ts: Date.now() }))

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

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

app.listen(PORT, () => {
  console.log(`\n[rentflow-api] listening on http://localhost:${PORT}`)
  console.log(`[rentflow-api] allowed origins: ${origins.join(', ')}\n`)
})
