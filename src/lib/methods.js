// Catalogue of payment methods a manager can enable/disable for their tenants.
// The list is driven by the manager's COUNTRY (see markets.js): card is
// universal, plus that country's mobile-money / bank / cash methods.
// 'online' methods are gateway-confirmed; 'manual' need an uploaded proof.

import { marketFor } from './markets.js'

const CARD = { key: 'card', label: 'Card', desc: 'Visa / Mastercard — paid on-site', kind: 'online' }

// Full option list for a manager's country.
export function paymentMethodsFor(manager) {
  const m = marketFor(manager?.country)
  const online = [CARD, ...(m.online || []).map((o) => ({ ...o, kind: 'online' }))]
  const manual = (m.manual || []).map((label) => ({ key: label, label, desc: 'Recorded manually with proof', kind: 'manual' }))
  return [...online, ...manual]
}
export function methodKeysFor(manager) { return paymentMethodsFor(manager).map((m) => m.key) }

// Resolve a manager's accepted methods. `null`/`undefined` means "all enabled"
// (the default); an explicit array (incl. empty) is respected.
export function acceptedMethods(manager) {
  const a = manager?.accepted_methods
  if (a == null) return methodKeysFor(manager)
  return Array.isArray(a) ? a : methodKeysFor(manager)
}

export function manualMethodsFor(manager) {
  const set = new Set(acceptedMethods(manager))
  return paymentMethodsFor(manager).filter((m) => m.kind === 'manual' && set.has(m.key)).map((m) => m.key)
}

// Back-compat: the default (Zimbabwe) catalogue, for code paths without a
// manager in hand. Prefer paymentMethodsFor(manager) where the manager is known.
export const PAYMENT_METHOD_OPTIONS = paymentMethodsFor({ country: 'ZW' })
export const ALL_METHOD_KEYS = PAYMENT_METHOD_OPTIONS.map((m) => m.key)
