// Shared form validators.

export function isValidEmail(v) {
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(String(v || '').trim())
}

// A phone number: at least 7 digits once symbols/spaces are stripped.
export function isValidPhone(v) {
  return String(v || '').replace(/\D/g, '').length >= 7
}

// A login identifier may be EITHER an email or a phone number.
export function isEmailOrPhone(v) {
  const s = String(v || '').trim()
  return s.includes('@') ? isValidEmail(s) : isValidPhone(s)
}

// ── Email typo detection ────────────────────────────────────────────────────
// Catches near-misses of the big providers (gmial.com → gmail.com) WITHOUT
// whitelisting domains — real addresses on any domain (e.g. gre.ac.uk, a
// company domain) must keep working, so we only suggest on a close match.
const COMMON_EMAIL_DOMAINS = [
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'ymail.com', 'yahoo.co.uk', 'icloud.com', 'me.com', 'aol.com',
  'proton.me', 'protonmail.com', 'zoho.com',
]

// Levenshtein edit distance (how many single-character edits apart two strings are).
function editDistance(a, b) {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,               // deletion
        cur[j - 1] + 1,            // insertion
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), // substitution
      )
    }
    prev = cur
  }
  return prev[n]
}

// Returns a corrected email ("...@gmail.com") when the domain looks like a typo
// of a common provider, otherwise null.
export function suggestEmailDomain(value) {
  const s = String(value || '').trim()
  const at = s.lastIndexOf('@')
  if (at < 1) return null
  const domain = s.slice(at + 1).toLowerCase()
  if (!domain || domain.length < 4) return null
  if (COMMON_EMAIL_DOMAINS.includes(domain)) return null // already correct

  let best = null, bestDist = Infinity
  for (const known of COMMON_EMAIL_DOMAINS) {
    const d = editDistance(domain, known)
    if (d < bestDist) { bestDist = d; best = known }
  }
  // 1–2 edits away = almost certainly a typo. Further away = a real other domain.
  if (best && bestDist >= 1 && bestDist <= 2) return `${s.slice(0, at + 1)}${best}`
  return null
}
