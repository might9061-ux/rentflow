// ═══════════════════════════════════════════════════════════════════════════
// Platform transaction fee.
//
// RentLoja charges a flat 0.5% on every rent payment processed through the app.
// The fee is borne by the landlord (manager) and is platform revenue the app
// owner sees in the admin dashboard. Tenants always pay the full rent amount.
// ═══════════════════════════════════════════════════════════════════════════

export const PLATFORM_FEE_RATE = 0.005 // 0.5%
export const PLATFORM_FEE_LABEL = '0.5%'

export function platformFee(amount) {
  return Math.round((Number(amount) || 0) * PLATFORM_FEE_RATE * 100) / 100
}

// The fee only applies to payments made THROUGH the app (the online gateway).
// Cash, bank transfer, InnBucks, Mukuru or any "upload proof" payment happened
// outside the app, so there's no platform fee on it.
export function feeFor(payment) {
  return payment?.paid_online ? platformFee(payment.amount) : 0
}
