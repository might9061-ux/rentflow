// Sentry init — imported FIRST in index.js so it's set up before anything else.
// Loads env, then turns on error monitoring only when SENTRY_DSN is set (so it's
// a no-op locally / until you add the DSN on Render). Errors only, no tracing.
import 'dotenv/config'
import * as Sentry from '@sentry/node'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    sendDefaultPii: false, // never attach request bodies / user data
    tracesSampleRate: 0,   // errors only — no performance sampling
  })
  console.log('[sentry] error monitoring on')
}
