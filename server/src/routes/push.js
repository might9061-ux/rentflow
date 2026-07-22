// Device registration for pop-up (Web Push) notifications.
import { Router } from 'express'
import { h } from '../auth.js'
import { pushConfigured, pushPublicKey, saveSubscription, removeSubscription, sendPushToUser } from '../push.js'

const router = Router()

// GET /api/push/key — the public VAPID key the browser needs to subscribe.
// Public by design; served from here so the frontend doesn't need its own copy
// in a build-time env var that could drift out of sync with the server's.
router.get('/key', h(async (_req, res) => {
  res.json({ enabled: pushConfigured(), publicKey: pushPublicKey() })
}))

// POST /api/push/subscribe { subscription, label }
router.post('/subscribe', h(async (req, res) => {
  if (!pushConfigured()) return res.status(503).json({ error: 'Pop-up notifications are not set up on this server.' })
  await saveSubscription({
    userId: req.user.id,
    subscription: req.body?.subscription,
    userAgent: req.headers['user-agent'] || null,
    label: req.body?.label || null,
  })
  res.json({ subscribed: true })
}))

// POST /api/push/unsubscribe { endpoint }
router.post('/unsubscribe', h(async (req, res) => {
  const endpoint = req.body?.endpoint
  if (!endpoint) throw new Error('Missing endpoint')
  await removeSubscription({ userId: req.user.id, endpoint })
  res.json({ unsubscribed: true })
}))

// POST /api/push/test — send the caller a pop-up on their own devices, so they
// can confirm notifications actually work before relying on them for rent.
router.post('/test', h(async (req, res) => {
  const result = await sendPushToUser(req.user.id, {
    title: 'RentLoja',
    body: 'Notifications are working. This is what a rent reminder will look like.',
    url: '/',
    tag: 'rentloja-test',
  })
  res.json(result)
}))

export default router
