// ═══════════════════════════════════════════════════════════════════════════
// Web Push — real phone pop-ups, the way WhatsApp or a bank app does it.
//
// A notification row in the database only becomes visible when someone opens
// RentLoja. Push is what makes a rent reminder actually reach a tenant: the
// browser's push service (FCM on Android, Mozilla on Firefox, Apple on iOS)
// wakes our service worker and it raises a system notification even when the
// app is closed.
//
// VAPID is how the push service knows the message really came from us. The
// PUBLIC key ships to the browser (that's its job); the PRIVATE key stays here.
//
// Everything in here is best-effort by design. A phone that is off, a browser
// that revoked permission, an expired subscription — none of that should ever
// fail the action that triggered the push. Sending a reminder must succeed even
// if the pop-up doesn't land.
// ═══════════════════════════════════════════════════════════════════════════
import webpush from 'web-push'
import { admin } from './supabase.js'

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY?.trim()
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY?.trim()
// mailto: contact the push service can reach if our sending misbehaves.
const SUBJECT = process.env.VAPID_SUBJECT?.trim() || 'mailto:support@rentloja.com'

let ready = false
if (PUBLIC_KEY && PRIVATE_KEY) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY)
  ready = true
} else {
  console.warn('[push] VAPID keys not set — pop-up notifications are off (in-app notices still work)')
}

export function pushConfigured() { return ready }
export function pushPublicKey() { return PUBLIC_KEY || null }

// Save (or refresh) one device's subscription. Keyed on endpoint, so the same
// device re-subscribing updates rather than duplicating.
export async function saveSubscription({ userId, subscription, userAgent, label }) {
  const { endpoint, keys } = subscription || {}
  if (!endpoint || !keys?.p256dh || !keys?.auth) throw new Error('Invalid push subscription')
  const { error } = await admin.from('push_subscriptions').upsert({
    endpoint,
    user_id: userId,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_agent: userAgent || null,
    label: label || null,
    last_seen: new Date().toISOString(),
    failed_at: null,
  }, { onConflict: 'endpoint' })
  if (error) throw new Error(error.message)
}

export async function removeSubscription({ userId, endpoint }) {
  // Scoped to the caller so nobody can unsubscribe someone else's device and
  // quietly stop their rent reminders.
  const { error } = await admin.from('push_subscriptions').delete()
    .eq('endpoint', endpoint).eq('user_id', userId)
  if (error) throw new Error(error.message)
}

// Send one notification to every device a user has allowed.
//
// Returns a count rather than throwing: callers treat push as a bonus on top of
// the in-app notification, never as the thing that must succeed.
export async function sendPushToUser(userId, payload) {
  if (!ready || !userId) return { sent: 0, failed: 0 }

  const { data: subs, error } = await admin.from('push_subscriptions')
    .select('endpoint, p256dh, auth').eq('user_id', userId)
  if (error) { console.error('[push] could not load subscriptions:', error.message); return { sent: 0, failed: 0 } }
  if (!subs?.length) return { sent: 0, failed: 0 }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || '/',
    tag: payload.tag || undefined,   // same tag replaces an older pop-up
    priority: payload.priority || 'normal',
  })

  let sent = 0, failed = 0
  const dead = []

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      )
      sent += 1
    } catch (err) {
      failed += 1
      // 404/410 mean the browser threw the subscription away (app uninstalled,
      // permission revoked, push service rotated it). Those never recover, so
      // drop them instead of retrying this device forever.
      if (err?.statusCode === 404 || err?.statusCode === 410) dead.push(s.endpoint)
      else console.error('[push] send failed:', err?.statusCode || '', err?.message || err)
    }
  }))

  if (dead.length) {
    await admin.from('push_subscriptions').delete().in('endpoint', dead)
    console.log(`[push] pruned ${dead.length} expired subscription(s)`)
  }
  return { sent, failed }
}

// Fire-and-forget wrapper: never let a push problem break the request that
// triggered it.
export function pushSafe(userId, payload) {
  sendPushToUser(userId, payload).catch((e) => console.error('[push] unexpected:', e?.message || e))
}
