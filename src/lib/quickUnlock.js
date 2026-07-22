// ═══════════════════════════════════════════════════════════════════════════
// Quick unlock — per-DEVICE convenience sign-in for the installed app.
//
// After a normal phone/email + password login, the user may secure this device
// with a short PIN and/or the phone's fingerprint / Face ID (a WebAuthn platform
// passkey). On the next visit they can unlock without re-typing the password.
//
// Storage is per-device (localStorage). In demo mode "unlocking" simply restores
// the saved {userId, role} session. In production the same UI maps to: PIN →
// unwraps a stored refresh token; passkey → authenticates to Supabase WebAuthn.
// ═══════════════════════════════════════════════════════════════════════════

const VAULT_KEY = 'rentflow_unlock_v1'

function loadVault() {
  try { return JSON.parse(localStorage.getItem(VAULT_KEY)) || { accounts: [] } }
  catch { return { accounts: [] } }
}
function saveVault(v) { localStorage.setItem(VAULT_KEY, JSON.stringify(v)) }

export function listAccounts() { return loadVault().accounts }

// After an explicit sign-out we stop offering password-free re-entry on the
// landing screen — signing out should mean signing out. The device's PIN /
// passkey registration is KEPT, so the in-app lock screen still works as soon
// as they sign back in, with nothing to set up again.
export function listResumable() { return loadVault().accounts.filter((a) => !a.dormant) }
export function getAccount(userId) { return loadVault().accounts.find((a) => a.userId === userId) || null }
export function hasQuickUnlock(userId) { return !!getAccount(userId) }

function upsert(account) {
  const v = loadVault()
  const i = v.accounts.findIndex((a) => a.userId === account.userId)
  if (i >= 0) v.accounts[i] = { ...v.accounts[i], ...account }
  else v.accounts.push(account)
  saveVault(v)
}

// Dormant = signed out on purpose. Hides the landing "Welcome back" card while
// leaving hasPin/hasBiometric intact for the in-app lock screen.
export function markSignedOut(userId) { if (getAccount(userId)) upsert({ userId, dormant: true }) }
export function clearSignedOut(userId) { if (getAccount(userId)) upsert({ userId, dormant: false }) }

export function forgetAccount(userId) {
  const v = loadVault()
  v.accounts = v.accounts.filter((a) => a.userId !== userId)
  saveVault(v)
}

// ── Saved sign-in token (lets unlock re-establish a REAL session) ────────────
// The biometric/PIN only proves it's you; the app still needs a live Supabase
// session to work. We keep the account's refresh token here, kept in sync with
// Supabase's rotation, so unlock can revive the session without the password.
// Only stored for accounts already secured on this device.
export function stashTokens(userId, tokens) {
  if (!getAccount(userId) || !tokens?.refresh_token) return
  upsert({ userId, tokens })
}
export function readTokens(userId) { return getAccount(userId)?.tokens || null }

// ── PIN (hashed with SHA-256 + per-account salt) ─────────────────────────────
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
function randomHex(bytes = 16) {
  const a = new Uint8Array(bytes); crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Save the device account and (optionally) a PIN. `meta` = {userId, role, name, identifier}.
export async function setPin(meta, pin) {
  const salt = randomHex()
  const pinHash = await sha256Hex(salt + ':' + pin)
  upsert({ ...meta, salt, pinHash })
}
export async function verifyPin(userId, pin) {
  const a = getAccount(userId)
  if (!a?.pinHash) return false
  return (await sha256Hex(a.salt + ':' + pin)) === a.pinHash
}
export function hasPin(userId) { return !!getAccount(userId)?.pinHash }

// ── Biometric (WebAuthn platform authenticator = fingerprint / Face ID) ──────
export async function biometricAvailable() {
  try {
    if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch { return false }
}
export function hasBiometric(userId) { return !!getAccount(userId)?.credentialId }

const b64url = {
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
}

// Register this device's fingerprint/Face ID. Stores the new credential id.
export async function registerBiometric(meta) {
  // A PIN has to exist first. Biometrics fail in ordinary ways — wet or cut
  // finger, a sensor that stops working, a face the phone stops recognising —
  // and with nothing to fall back on the lock screen has no way through.
  // Enforced here rather than only in the setup UI so the rule holds wherever
  // this is called from.
  if (!hasPin(meta.userId)) {
    throw new Error('Set your app PIN first — it\'s the fallback if fingerprint or Face ID doesn\'t work.')
  }
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const userId = new TextEncoder().encode(meta.userId)
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'RentLoja', id: window.location.hostname },
      user: { id: userId, name: meta.identifier || meta.userId, displayName: meta.name || 'RentLoja user' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000,
    },
  })
  if (!cred) throw new Error('Biometric setup was cancelled.')
  upsert({ ...meta, credentialId: b64url.enc(cred.rawId) })
  return true
}

// Verify the device owner with fingerprint/Face ID. Resolves on success.
export async function unlockBiometric(userId) {
  const a = getAccount(userId)
  if (!a?.credentialId) throw new Error('No biometric set up on this device.')
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ id: b64url.dec(a.credentialId), type: 'public-key' }],
      userVerification: 'required',
      timeout: 60000,
    },
  })
  if (!assertion) throw new Error('Fingerprint / Face ID was not recognised.')
  return true
}
