// ═══════════════════════════════════════════════════════════════════════════
// Pop-up (Web Push) notifications — the browser half.
//
// Asks the device for permission, hands the resulting subscription to our API,
// and remembers nothing itself: the browser is the source of truth for whether
// notifications are on, so we always read the live state instead of caching a
// flag that can silently go stale when someone revokes permission in their
// phone settings.
//
// Everything here degrades quietly. Push is unavailable on plenty of real
// devices — iOS only supports it for apps added to the Home Screen, and some
// in-app browsers not at all — so callers get a clear reason string rather than
// a broken switch.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from './supabaseClient.js'

const BASE = (import.meta.env.VITE_API_URL?.trim() || '').replace(/\/+$/, '')

async function api(method, path, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const resp = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const text = await resp.text()
  const json = text ? JSON.parse(text) : null
  if (!resp.ok) throw new Error(json?.error || `${resp.status} ${resp.statusText}`)
  return json
}

// The VAPID public key travels as base64url but the subscribe API wants bytes.
function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export function pushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

// iOS only delivers push to an app installed to the Home Screen — worth saying
// out loud, because on Safari the toggle otherwise just appears broken.
export function isIosNotInstalled() {
  if (typeof window === 'undefined') return false
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) // iPadOS
  const installed = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone
  return ios && !installed
}

// Live state, read from the browser every time.
export async function pushStatus() {
  if (!pushSupported()) {
    return { supported: false, enabled: false, permission: 'unsupported', reason: isIosNotInstalled()
      ? 'On iPhone, add RentLoja to your Home Screen first — then notifications can be switched on.'
      : 'This browser cannot show pop-up notifications.' }
  }
  const permission = Notification.permission
  let enabled = false
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    enabled = permission === 'granted' && !!(await reg?.pushManager.getSubscription())
  } catch { enabled = false }
  return { supported: true, enabled, permission }
}

// Turn pop-ups on for THIS device. Must be called from a click — browsers
// ignore a permission prompt that isn't tied to a user gesture.
export async function enablePush() {
  if (!pushSupported()) throw new Error((await pushStatus()).reason)

  const { enabled: serverEnabled, publicKey } = await api('GET', '/api/push/key')
  if (!serverEnabled || !publicKey) throw new Error('Pop-up notifications are not set up on the server yet.')

  const permission = await Notification.requestPermission()
  if (permission === 'denied') {
    throw new Error('Notifications are blocked for RentLoja. Turn them back on in your browser or phone settings.')
  }
  if (permission !== 'granted') throw new Error('Notification permission was not granted.')

  const reg = await navigator.serviceWorker.ready
  // Reuse an existing subscription unless it was created for a different VAPID
  // key (e.g. the server's keys were rotated) — pushes to a stale one silently
  // fail, which is the worst possible outcome for a rent reminder.
  let sub = await reg.pushManager.getSubscription()
  const wanted = urlBase64ToUint8Array(publicKey)
  if (sub && !sameKey(sub.options?.applicationServerKey, wanted)) {
    await sub.unsubscribe().catch(() => {})
    sub = null
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wanted })
  }

  await api('POST', '/api/push/subscribe', { subscription: sub.toJSON(), label: deviceLabel() })
  return true
}

// A device (endpoint) belongs to ONE account — the server upserts on endpoint.
// On a shared phone (e.g. testing manager and tenant side by side), whoever
// subscribed LAST owned the device, so the other account's alerts landed on it
// — a tenant could see a "new message from a tenant" pop-up about their own
// message. Re-claim the subscription for whoever is signed in NOW, so alerts
// always follow the active account. Called on session resolve; best-effort.
export async function reclaimPush() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return
    await api('POST', '/api/push/subscribe', { subscription: sub.toJSON(), label: deviceLabel() })
  } catch { /* best-effort — never block sign-in over push */ }
}

export async function disablePush() {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  // Tell the server first: if unsubscribe() succeeds but the API call fails,
  // we'd keep pushing to a dead endpoint forever.
  await api('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {})
  await sub.unsubscribe().catch(() => {})
}

// Prove it works, on demand.
export async function sendTestPush() { return api('POST', '/api/push/test') }

function sameKey(a, b) {
  if (!a || !b) return false
  const x = new Uint8Array(a)
  return x.length === b.length && x.every((v, i) => v === b[i])
}

function deviceLabel() {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iPhone'
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} on ${os}` : browser
}
