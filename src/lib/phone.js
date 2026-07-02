import { DEFAULT_COUNTRY_CODE } from './supabaseClient.js'
import { COUNTRIES } from './countries.js'

// Every country with its dial code + flag, offered in the phone picker.
export const COUNTRY_CODES = COUNTRIES

// Split a stored phone value into { dial, local } for the picker.
export function splitPhone(value, fallback = DEFAULT_COUNTRY_CODE) {
  if (!value) return { dial: fallback, local: '' }
  const s = String(value).trim()
  const digits = s.replace(/\D/g, '')
  // International form (has + or 00 prefix, or no leading 0): match a dial code.
  if (s.startsWith('+') || s.startsWith('00') || (!s.startsWith('0') && digits.length > 9)) {
    const d = s.startsWith('00') ? digits.slice(2) : digits
    const match = [...COUNTRY_CODES].sort((a, b) => b.dial.length - a.dial.length).find((c) => d.startsWith(c.dial))
    if (match) return { dial: match.dial, local: d.slice(match.dial.length) }
  }
  // Local form (e.g. 0772…) → fallback country, strip leading zeros.
  return { dial: fallback, local: digits.replace(/^0+/, '') }
}

// Combine a dial code + local number into stored E.164-ish form (+<dial><local>).
export function joinPhone(dial, local) {
  const clean = String(local || '').replace(/\D/g, '').replace(/^0+/, '')
  return clean ? `+${dial}${clean}` : ''
}

// Normalise a Zimbabwean (or international) phone number to digits-only
// international format, e.g. "0772123456" -> "263772123456".
export function toInternational(raw, countryCode = DEFAULT_COUNTRY_CODE) {
  if (!raw) return ''
  let s = String(raw).trim().replace(/[\s\-()]/g, '')

  if (s.startsWith('+')) return s.slice(1).replace(/\D/g, '')

  // 00 international prefix
  if (s.startsWith('00')) return s.slice(2).replace(/\D/g, '')

  s = s.replace(/\D/g, '')

  // Leading 0 -> replace with country code (e.g. 0772... -> 263772...)
  if (s.startsWith('0')) return countryCode + s.slice(1)

  // Already starts with the country code
  if (s.startsWith(countryCode)) return s

  // Bare local number without leading 0 (e.g. 772123456)
  if (s.length >= 9 && s.length <= 10) return countryCode + s

  return s
}

// Pretty display: +263 77 212 3456
export function prettyPhone(raw) {
  const intl = toInternational(raw)
  if (!intl) return '—'
  return '+' + intl
}

// Privacy-masked display: +263 ••• ••• 001 — used wherever we tell a user
// where a code is going, without revealing the full registered number.
export function maskPhone(raw) {
  const intl = toInternational(raw)
  if (!intl || intl.length < 6) return '—'
  const cc = intl.slice(0, 3)
  const last = intl.slice(-3)
  return `+${cc} ••• ••• ${last}`
}
