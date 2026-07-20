// Two-factor authentication (TOTP) for privileged accounts.
//
// Supabase models this as "assurance levels": signing in with a password gives
// AAL1, and verifying a 6-digit code raises the session to AAL2. Crucially,
// signInWithPassword SUCCEEDS at AAL1 even when a factor is enrolled — so the
// app has to check the level and demand the code itself. The API enforces the
// same thing on its side, since a client-side check alone proves nothing.
import { supabase } from './supabaseClient.js'

// Verified factors on this account (an unverified one is a half-finished setup).
export async function listFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw new Error(error.message)
  const all = data?.all || []
  return {
    verified: all.filter((f) => f.status === 'verified'),
    unverified: all.filter((f) => f.status !== 'verified'),
  }
}

export async function isEnrolled() {
  try { return (await listFactors()).verified.length > 0 } catch { return false }
}

// Where this session stands: 'aal1' (password only) or 'aal2' (code verified).
// nextLevel === 'aal2' while currentLevel === 'aal1' means a code is required.
export async function assuranceLevel() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error) throw new Error(error.message)
  return { current: data?.currentLevel || null, next: data?.nextLevel || null }
}

export async function needsChallenge() {
  try {
    const { current, next } = await assuranceLevel()
    return next === 'aal2' && current !== 'aal2'
  } catch { return false }
}

// Start enrolment — returns the QR code to scan and the secret to type manually.
// The factor is NOT active until confirmEnrol() succeeds with a valid code, so
// a half-finished setup can never lock anyone out.
export async function beginEnrol(friendlyName = 'RentLoja admin') {
  // Supabase rejects a duplicate friendly name; clear any abandoned attempt.
  const { unverified } = await listFactors()
  for (const f of unverified) { try { await supabase.auth.mfa.unenroll({ factorId: f.id }) } catch { /* ignore */ } }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName })
  if (error) throw new Error(error.message)
  return { factorId: data.id, qr: data.totp?.qr_code, secret: data.totp?.secret }
}

export async function confirmEnrol(factorId, code) {
  const ch = await supabase.auth.mfa.challenge({ factorId })
  if (ch.error) throw new Error(ch.error.message)
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.data.id, code: String(code).trim() })
  if (error) throw new Error(friendlyCodeError(error.message))
  return true
}

// Answer the code prompt at sign-in — raises this session to AAL2.
export async function verifyCode(code) {
  const { verified } = await listFactors()
  const factor = verified[0]
  if (!factor) throw new Error('No authenticator is set up on this account.')
  const ch = await supabase.auth.mfa.challenge({ factorId: factor.id })
  if (ch.error) throw new Error(ch.error.message)
  const { error } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: ch.data.id, code: String(code).trim() })
  if (error) throw new Error(friendlyCodeError(error.message))
  return true
}

// Removing the last factor drops the account back to password-only, so callers
// should confirm first.
export async function removeFactor(factorId) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw new Error(error.message)
  return true
}

function friendlyCodeError(msg) {
  if (/invalid|incorrect/i.test(msg)) return 'That code isn’t right. Check your authenticator app and try the current code.'
  if (/expired/i.test(msg)) return 'That code has expired — codes last 30 seconds. Enter the current one.'
  return msg
}
