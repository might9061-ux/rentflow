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
