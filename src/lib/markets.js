// ═══════════════════════════════════════════════════════════════════════════
// Markets — Zimbabwe only (launch market).
//
// The currency drives everywhere money() formats; the MOBILE-MONEY methods
// drive what tenants can pay with. Zimbabwe is dual-currency: USD + ZiG (ZWG).
// The country/currency selectors are kept as a single-market list so the rest
// of the app (Settings, sign-up, mockDb) needs no structural change if more
// markets are added back later.
// ═══════════════════════════════════════════════════════════════════════════

export const CURRENCIES = {
  USD: { symbol: '$',   locale: 'en-US', decimals: 2 },
  ZWG: { symbol: 'ZiG', locale: 'en-ZW', decimals: 2 },
}

// online = gateway-confirmed (instant receipt); manual = uploaded proof + approval.
export const MARKETS = {
  ZW: { name: 'Zimbabwe', dial: '263', currency: 'USD', currencies: ['USD', 'ZWG'],
        online: [{ key: 'ecocash', label: 'EcoCash express', desc: 'PIN prompt pushed to the payer’s phone' }],
        manual: ['Cash USD', 'InnBucks', 'Bank Transfer', 'Mukuru'] },
}

export const DEFAULT_COUNTRY = 'ZW'

export const MARKET_LIST = Object.entries(MARKETS)
  .map(([code, m]) => ({ code, ...m }))
  .sort((a, b) => a.name.localeCompare(b.name))

export function marketFor(country) { return MARKETS[country] || MARKETS[DEFAULT_COUNTRY] }

// Single launch market — always Zimbabwe.
export function guessCountry() { return DEFAULT_COUNTRY }
export function currencyFor(country) { return CURRENCIES[marketFor(country).currency] || CURRENCIES.USD }
export function currencyByCode(code) { return CURRENCIES[code] || CURRENCIES.USD }

// The currencies a manager may accept. Zimbabwe is dual-currency: USD + ZiG.
// Managers can enable one or both of these.
export function currencyOptions(country) {
  const m = marketFor(country)
  const base = m.currencies || [m.currency]
  return Array.from(new Set([...base, 'USD'])).map((code) => ({ code, ...CURRENCIES[code] }))
}
