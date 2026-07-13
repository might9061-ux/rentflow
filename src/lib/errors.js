// Turn raw backend/database errors into plain-language messages for users.
// Keeps technical strings (Postgres/PostgREST/Supabase) out of the UI.
export function friendlyError(err, fallback = 'Something went wrong. Please try again.') {
  const msg = (err?.message || String(err || '')).toLowerCase()
  if (!msg) return fallback

  // Wrong email/phone or password.
  if (msg.includes('invalid login') || msg.includes('invalid credentials') || msg.includes('invalid email or password'))
    return 'Incorrect email/phone or password. Please try again.'

  // No matching row / account (e.g. the raw "cannot coerce the result to a single JSON object").
  if (msg.includes('coerce') || msg.includes('0 rows') || msg.includes('no rows') || msg.includes('not found in your workspace'))
    return 'We couldn’t find an account with those details. Check your email/phone — and make sure you’re on the right sign-in page (tenant vs. manager).'

  if (msg.includes('no account found for that phone'))
    return 'No account found for that phone number. Try your email instead.'

  // Email verification.
  if (msg.includes('email not confirmed') || msg.includes('not confirmed'))
    return 'Please verify your email first — check your inbox (and spam) for the confirmation link.'

  // Rate limiting.
  if (msg.includes('rate limit') || msg.includes('too many') || msg.includes('429'))
    return 'Too many attempts. Please wait a minute and try again.'

  // Account state.
  if (msg.includes('suspended'))
    return 'This account has been suspended. Please contact your property manager.'
  if (msg.includes('already registered') || msg.includes('already exists'))
    return 'An account with this email already exists. Try signing in instead.'

  // Connectivity.
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed') || msg.includes('fetch'))
    return 'Connection problem. Check your internet and try again.'

  // A message we already wrote in plain language — keep it if it looks friendly.
  if (err?.message && err.message.length < 120 && !/[{}]|coerce|jwt|rpc|null value|violates|constraint/i.test(err.message))
    return err.message

  return fallback
}
