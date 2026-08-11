// ═══════════════════════════════════════════════════════════════════════════
// AI assistant — the single seam for both the manager and tenant copilots.
//
//   • VITE_AI_PROVIDER unset / 'demo'  → a grounded, rule-based assistant that
//     answers from the app's own data (rent, balance, arrears, advance, due
//     dates, methods, stats…). Works with zero credentials.
//   • VITE_AI_PROVIDER = 'claude'       → POSTs to VITE_API_URL/api/assistant on
//     the RentLoja API server, which calls Claude with ANTHROPIC_API_KEY. The
//     key and the system prompt both stay server-side. ← the live setup.
//   • VITE_AI_PROVIDER = 'anthropic'    → POSTs to the Supabase Edge Function
//     `assistant`, which calls Claude server-side (production).
//
// Both live paths are grounded with the SAME computed facts the demo uses, and
// fall back to the demo reply if the backend is unavailable, so the copilots are
// always useful. Swapping demo → live changes nothing for callers.
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from './supabaseClient.js'
import { money, fullName, monthYear } from './format.js'
import { formatPeriod } from './billing.js'
import { computeArrears, computeAdvance } from './arrears.js'
import { tenantLedger } from './ledger.js'
import { paymentMethodsFor } from './methods.js'

export const AI_PROVIDER = import.meta.env.VITE_AI_PROVIDER?.trim() || 'demo'
const API_BASE = (import.meta.env.VITE_API_URL?.trim() || '').replace(/\/+$/, '')
export const isLiveAI = AI_PROVIDER === 'claude' || AI_PROVIDER === 'anthropic'

// role: 'manager' | 'tenant'; context: see buildContext in the widget.
export async function askAssistant({ role, message, context, history = [] }) {
  const facts = role === 'manager' ? managerFacts(context) : tenantFacts(context)

  if (isLiveAI) {
    try {
      return await askClaude({ role, message, context, facts, history })
    } catch (err) {
      // Never leave the user stuck — fall back to the grounded demo answer.
      console.warn('[ai] live provider failed, using demo fallback:', err?.message || err)
      return demoReply(role, message, context, facts)
    }
  }

  await new Promise((r) => setTimeout(r, 300)) // tiny latency for realism
  return demoReply(role, message, context, facts)
}

function demoReply(role, message, context, facts) {
  return role === 'manager' ? managerReply(message, context, facts) : tenantReply(message, context, facts)
}

// ── Live backend (Claude) ────────────────────────────────────────────────────
async function askClaude({ role, message, context, facts, history }) {
  if (AI_PROVIDER === 'anthropic') {
    // Supabase Edge Function builds its own prompt server-side; pass facts along.
    const { data, error } = await supabase.functions.invoke('assistant', {
      body: { role, message, context: { ...context, facts }, history },
    })
    if (error) throw new Error(error.message)
    return data.reply
  }

  // AI_PROVIDER === 'claude' → the RentLoja API server.
  //
  // We deliberately do NOT send a system prompt: the server builds it. Letting
  // the browser supply one would turn this endpoint into a general-purpose
  // Claude proxy for anyone who found it, billed to us. We send only the role,
  // the question, and the caller's own facts.
  //
  // The request goes to VITE_API_URL, not a relative path — in production the
  // app is on rentloja.com and the API is on a different host, so a same-origin
  // "/api/assistant" would never reach the server.
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${API_BASE}/api/assistant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({
      role,
      message,
      facts,
      history: history.map((m) => ({ role: m.role, text: m.text })),
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `assistant endpoint ${res.status}`)
  return data.reply
}

// NOTE: the system prompt used to be built here and POSTed to the server. It now
// lives in server/src/routes/assistant.js — see the comment in askClaude above
// for why the browser must not be the one writing the model's instructions.

// ── Derived facts (shared by demo + live) ────────────────────────────────────
function managerFacts(ctx = {}) {
  const { profile, tenants = [], properties = [], payments = [] } = ctx || {}
  const approved = payments.filter((p) => p.status === 'approved')
  const pending = payments.filter((p) => p.status === 'pending')
  const collected = approved.reduce((s, p) => s + Number(p.amount), 0)
  const pendingTotal = pending.reduce((s, p) => s + Number(p.amount), 0)

  const active = tenants.filter((t) => t.account_status === 'active')
  const arrears = active
    .map((t) => ({ t, a: computeArrears(t, payments) }))
    .filter((x) => x.a.total > 0)
    .sort((a, b) => b.a.total - a.a.total)
    .map(({ t, a }) => ({
      name: fullName(t), unit: t.unit || '—', total: a.total,
      broughtForward: a.broughtForward, thisMonth: a.currentOwed, monthsBehind: a.monthsBehind,
    }))

  const advance = active
    .map((t) => ({ t, adv: computeAdvance(t, payments) }))
    .filter((x) => x.adv.hasAdvance)
    .sort((a, b) => b.adv.credit - a.adv.credit)
    .map(({ t, adv }) => ({
      name: fullName(t), unit: t.unit || '—', credit: adv.credit,
      monthsCovered: adv.monthsCovered, coveredThrough: monthYear(adv.coveredThrough),
      partial: adv.partialMonth ? `${money(adv.partialAmount)} (${adv.partialPct}%) toward ${monthYear(adv.partialMonth)}` : null,
    }))

  const totalUnits = properties.reduce((s, p) => s + Number(p.units || 0), 0)
  const occupied = tenants.filter((t) => t.property_id && t.account_status !== 'suspended').length

  return {
    role: 'manager',
    managerName: fullName(profile),
    collected, approvedCount: approved.length,
    pendingCount: pending.length, pendingTotal,
    arrears, arrearsTotal: arrears.reduce((s, x) => s + x.total, 0),
    arrearsBroughtForward: arrears.reduce((s, x) => s + x.broughtForward, 0),
    advance, advanceTotal: advance.reduce((s, x) => s + x.credit, 0),
    occupancyPct: totalUnits ? Math.round((occupied / totalUnits) * 100) : 0,
    occupied, totalUnits, propertiesCount: properties.length,
    tenantsCount: tenants.length, activeCount: active.length,
    paidUpCount: active.length - arrears.length,
    roster: tenants.map((t) => ({ name: fullName(t), unit: t.unit || '—', rent: Number(t.rent || 0), status: t.status, account: t.account_status })),
  }
}

function tenantFacts(ctx = {}) {
  const { profile = {}, manager, payments = [], accepted = [], payDetails = {}, period } = ctx || {}
  const rent = Number(profile.rent || 0)
  const led = tenantLedger(profile, payments)
  const arr = computeArrears(profile, payments)
  const adv = computeAdvance(profile, payments)
  // Credit, status and owed-this-period come from the ledger, not the stored
  // credit_balance/status columns, so they match the tenant's own screen.
  const credit = adv.credit
  const methods = paymentMethodsFor(manager).filter((m) => accepted.includes(m.key))

  return {
    role: 'tenant',
    firstName: profile.first_name || 'there',
    rent, status: led.currentStatus, credit,
    period: period ? formatPeriod(period) : null,
    owedThisPeriod: arr.currentOwed,
    arrears: { broughtForward: arr.broughtForward, total: arr.total, monthsBehind: arr.monthsBehind },
    advance: adv.hasAdvance
      ? { credit, monthsCovered: adv.monthsCovered, coveredThrough: monthYear(adv.coveredThrough),
          partial: adv.partialMonth ? `${money(adv.partialAmount)} (${adv.partialPct}%) toward ${monthYear(adv.partialMonth)}` : null }
      : null,
    acceptedMethods: methods.map((m) => m.label),
    payDetails: Object.fromEntries(methods.map((m) => [m.label, payDetails[m.key]]).filter(([, v]) => v)),
    managerName: manager ? fullName(manager) : null,
  }
}

// ── Demo assistant (rule-based, grounded in computed facts) ──────────────────
// Strip punctuation/apostrophes and lowercase so "haven't" == "havent", and
// "EcoCash?" == "ecocash". This alone fixes most "it couldn't understand me".
function normalize(s) {
  return (s || '').toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Levenshtein edit distance — for typo tolerance ("arears" → "arrears").
function lev(a, b) {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = cur
  }
  return prev[n]
}

// How many edits we tolerate for a word of a given length. Tuned so negations
// stay distinct: tolerance("havent")=1 means "have" (2 edits away) is NOT read
// as a typo of "havent" — otherwise "who HAS paid" flips to "who HASN'T paid".
// Still allows real typos like payd→paid, ahed→ahead, arears→arrears.
function tolerance(len) {
  return len <= 3 ? 0 : len <= 6 ? 1 : len <= 9 ? 2 : 3
}

function fuzzyToken(tokens, word) {
  const tol = tolerance(word.length)
  return tokens.some((t) => t === word || (Math.abs(t.length - word.length) <= tol && lev(t, word) <= tol))
}

// Typo- and punctuation-tolerant keyword match. Multi-word phrases match as a
// normalized substring, or when every word is fuzzily present.
function has(raw, ...phrases) {
  const q = normalize(raw)
  const tokens = q.split(' ').filter(Boolean)
  return phrases.some((p) => {
    const phrase = normalize(p)
    if (!phrase) return false
    if (phrase.includes(' ')) {
      return q.includes(phrase) || phrase.split(' ').every((w) => fuzzyToken(tokens, w))
    }
    return q.includes(phrase) || fuzzyToken(tokens, phrase)
  })
}

// Whole-word match. `has` matches single words as substrings, which is what we
// want for "due" → "overdue" or "owe" → "owed", but wrong for short greetings:
// "hi" otherwise matches inside "history" and "behind", so "payment history"
// and "am I behind?" were both answered with a cheery hello.
function hasWord(raw, ...words) {
  const tokens = normalize(raw).split(' ').filter(Boolean)
  return words.some((w) => tokens.includes(normalize(w)))
}

function tenantReply(raw, ctx, f) {
  const q = (raw || '').toLowerCase()

  if (hasWord(q, 'hi', 'hey', 'hello') || has(q, 'help', 'what can you', 'morning', 'good day')) {
    return `Hi ${f.firstName} 👋 I'm your RentLoja assistant. I can help with:\n• Your rent, balance and what's due\n• Any balance carried over from past months\n• Credit / paying ahead and how long it lasts\n• How and where to pay\n• Receipts and history\nWhat would you like to know?`
  }
  // "What's my rent?" is the single most common question, so 'rent' has to be a
  // trigger — but it's a broad word that would otherwise swallow "how do I pay
  // rent" and "rent receipt", which want the more specific answers below. Those
  // intents are checked first and this one steps aside for them.
  const wantsPayInfo = has(q, 'pay', 'method', 'ecocash', 'bank', 'innbucks', 'mukuru', 'card')
  const wantsReceipt = has(q, 'receipt', 'history', 'proof', 'statement')
  // "Have I paid this month?", "am I paid up?" and "what period am I paying
  // for?" are asking about STATUS, but every one of them contains "pay" inside
  // paid/paying — which sent them to the how-to-pay answer instead. Status is
  // the more specific intent, so it wins over both of the guards above.
  const wantsStatus = has(q, 'have i paid', 'did i pay', 'am i paid', 'paid this', 'paid up', 'up to date', 'period')
  if (wantsStatus || (!wantsPayInfo && !wantsReceipt
    && has(q, 'balance', 'owe', 'owing', 'how much', 'outstanding', 'due', 'arrear', 'behind', 'carried', 'previous', 'rent'))) {
    let r = `Your rent is ${money(f.rent)} per month and your status is "${f.status}".`
    if (f.period) r += `\nCurrent billing period: ${f.period}.`
    if (f.arrears.broughtForward > 0) {
      r += `\n⚠️ You have ${money(f.arrears.broughtForward)} carried over from previous months. Including this month, your total balance is about ${money(f.arrears.total)} (${f.arrears.monthsBehind} month${f.arrears.monthsBehind === 1 ? '' : 's'} behind).`
    } else if (f.advance) {
      r += `\nYou're paid ahead — ${money(f.credit)} credit, covering you through ${f.advance.coveredThrough}.`
    } else if (f.owedThisPeriod > 0) {
      r += `\nAmount due this period: about ${money(f.owedThisPeriod)}.`
    } else {
      r += `\nYou're fully paid up — nothing due right now. 🎉`
    }
    return r
  }
  if (has(q, 'credit', 'advance', 'ahead', 'extra', 'how long', 'last', 'cover')) {
    if (f.advance) {
      let r = `You have ${money(f.credit)} credit. That covers about ${f.advance.monthsCovered} month${f.advance.monthsCovered === 1 ? '' : 's'} — you're paid up through ${f.advance.coveredThrough}.`
      if (f.advance.partial) r += `\nAfter that, ${f.advance.partial} is already covered.`
      r += `\nPay more than ${money(f.rent)} any time to build more credit; it's applied automatically each month.`
      return r
    }
    return `You don't have any credit right now. If you pay more than ${money(f.rent)} in one go, the extra becomes credit and is applied automatically to your next month's rent — and I'll tell you how many months it covers.`
  }
  // Guarded the same way: "payment history" contains "pay", but it's asking for
  // receipts, not for how to pay.
  if (!wantsReceipt && !wantsStatus && has(q, 'pay', 'method', 'ecocash', 'bank', 'cash', 'innbucks', 'mukuru', 'card', 'where', 'send', 'how do i')) {
    let r = `You can pay via: ${f.acceptedMethods.join(', ') || 'the methods your manager enabled'}.\nGo to "Make a payment", enter the amount, and pick a method.`
    for (const [label, details] of Object.entries(f.payDetails)) {
      if (q.includes(label.toLowerCase().split(' ')[0])) r += `\n\nFor ${label}, send to:\n${details}`
    }
    r += `\n\nCard & EcoCash are confirmed instantly; cash/bank/InnBucks/Mukuru need a proof upload and manager approval.`
    return r
  }
  if (has(q, 'receipt', 'history', 'proof', 'statement')) {
    return `Open "Payment history" to see every month's status. Approved months have a downloadable receipt — tap the receipt button on that row. You can switch between the last 12 months and a full 5-year view.`
  }
  if (has(q, 'verify', 'otp', 'code', 'password', 'forgot', 'login')) {
    return `Verification codes are only sent to the email and phone your manager registered for you. If you're locked out, use "Forgot password?" on the sign-in screen — it sends a reset code to your registered contacts. You can change your password anytime from the sidebar.`
  }
  if (has(q, 'manager', 'landlord', 'contact')) {
    return f.managerName ? `Your property manager is ${f.managerName}. They review and approve manual payments and send notices that appear in your bell icon.` : `Your manager handles approvals and notices.`
  }
  return `I can help with your rent, balance, any arrears carried over, credit/advance, payment methods, receipts and verification. Try "how much do I owe?", "how long does my credit last?", or "where do I send a bank transfer?".${f.managerName ? ` For anything I can't answer, your manager (${f.managerName}) can help directly.` : ''}`
}

function managerReply(raw, ctx, f) {
  const q = (raw || '').toLowerCase()

  // Specific tenant lookup — "how is Farai doing?", "Rudo balance"
  const named = findTenant(q, ctx?.tenants)
  if (named) return tenantSummaryForManager(named, ctx)

  if (hasWord(q, 'hi', 'hey', 'hello') || has(q, 'help', 'what can you', 'morning', 'good day')) {
    return `Hi ${f.managerName?.split(' ')[0] || ''} 👋 I'm your RentLoja copilot. Ask me about:\n• Who's behind & how much is carried over from past months\n• Who's paid ahead & how long their credit lasts\n• Pending approvals, collections & occupancy\n• How to add tenants/properties, record a cash payment, or send notices\nWhat do you need?`
  }
  // Advance is checked before arrears so "who's paid ahead?" isn't swallowed by
  // the broad "who" in the arrears intent.
  if (has(q, 'paid ahead', 'advance', 'ahead', 'prepaid', 'credit', 'how long', 'covered', 'in advance')) {
    if (f.advance.length === 0) return `No tenant is currently paid ahead.`
    const names = f.advance.slice(0, 8).map((a) =>
      `• ${a.name} (Unit ${a.unit}) — ${money(a.credit)}, covers ${a.monthsCovered} mo (through ${a.coveredThrough})${a.partial ? `, then ${a.partial}` : ''}`).join('\n')
    return `${f.advance.length} tenant${f.advance.length === 1 ? '' : 's'} paid ahead, ${money(f.advanceTotal)} on file:\n${names}\n\nSee Payments → Advance for the full view.`
  }
  // Positive "who HAS paid" — guarded against negations so it isn't confused
  // with the arrears question.
  if (has(q, 'have paid', 'has paid', 'who paid', 'paid up', 'fully paid', 'settled', 'up to date', 'paid this month', 'paid rent')
    && !has(q, 'havent', 'hasnt', 'not', 'unpaid', 'outstanding', 'behind', 'owe', 'owing', 'arrears', 'overdue', 'ahead')) {
    let r = `${f.paidUpCount} of ${f.activeCount} active tenant${f.activeCount === 1 ? ' is' : 's are'} fully paid up`
    r += f.arrears.length ? `, and ${f.arrears.length} ${f.arrears.length === 1 ? 'is' : 'are'} still behind (${money(f.arrearsTotal)} outstanding).` : ` — everyone's current. 🎉`
    if (f.advance.length) r += `\n${f.advance.length} of them ${f.advance.length === 1 ? 'is' : 'are'} even paid ahead (${money(f.advanceTotal)} on file).`
    return r
  }
  if (has(q, 'outstanding', 'arrears', 'havent paid', 'hasnt paid', 'not paid', 'didnt pay', 'no payment', 'behind', 'owe', 'owes', 'owing', 'unpaid', 'who', 'debt', 'carried', 'previous month', 'overdue', 'defaulter')) {
    if (f.arrears.length === 0) return `Everyone's up to date — no outstanding rent right now. 🎉`
    const names = f.arrears.slice(0, 8).map((a) =>
      `• ${a.name} (Unit ${a.unit}) — ${money(a.total)}${a.broughtForward > 0 ? ` (incl. ${money(a.broughtForward)} carried over, ${a.monthsBehind} mo behind)` : ''}`).join('\n')
    return `${f.arrears.length} tenant${f.arrears.length === 1 ? '' : 's'} behind, totalling ${money(f.arrearsTotal)} (${money(f.arrearsBroughtForward)} carried over from previous months):\n${names}${f.arrears.length > 8 ? `\n…and ${f.arrears.length - 8} more` : ''}\n\nSee Payments → Owing to send reminders or record a payment.`
  }
  if (has(q, 'pending', 'approve', 'approval', 'review', 'queue', 'waiting')) {
    if (f.pendingCount === 0) return `No payments are waiting for approval — you're all caught up.`
    return `${f.pendingCount} payment${f.pendingCount === 1 ? '' : 's'} awaiting approval, ${money(f.pendingTotal)} in total. Review them on the Approvals page.`
  }
  if (has(q, 'collected', 'revenue', 'total', 'income', 'earned', 'received')) {
    return `You've collected ${money(f.collected)} across ${f.approvedCount} approved payments. Outstanding across tenants behind is ${money(f.arrearsTotal)}, and ${money(f.advanceTotal)} is sitting as advance credit.`
  }
  // 'tenant' belongs here too: "how many tenants do I have?" is the same
  // question as occupancy from the other side, and the counts are already
  // computed — it used to fall through to the generic reply.
  if (has(q, 'occupancy', 'vacant', 'units', 'empty', 'occupied', 'tenant', 'how many')) {
    return `Occupancy is ${f.occupancyPct}% — ${f.occupied} of ${f.totalUnits} units across ${f.propertiesCount} propert${f.propertiesCount === 1 ? 'y' : 'ies'}.`
      + `\nYou have ${f.activeCount} active tenant${f.activeCount === 1 ? '' : 's'}${f.tenantsCount !== f.activeCount ? ` (${f.tenantsCount} on file in total)` : ''}.`
  }
  if (has(q, 'cash', 'record payment', 'paid cash', 'mark paid')) {
    return `When a tenant pays you in cash, open their profile (or Payments → Owing) and tap "Record payment". Enter the amount, method and date — it's logged as an approved payment, applies any extra as credit, and clears them from the Owing list.`
  }
  if (has(q, 'add tenant', 'new tenant', 'create tenant')) {
    return `Go to Tenants → "Add tenant". Fill in their details and rent; RentLoja generates a temporary password and a WhatsApp link to send the login. They verify and set their own password on first login. (Heads up: you can only add as many tenants as your plan allows.)`
  }
  if (has(q, 'property', 'building')) {
    return `Manage buildings under Properties → "Add property". Each shows a Vacant / Partial / All Paid badge based on its tenants' status, and you can add photos, location, rooms and amenities.`
  }
  if (has(q, 'notif', 'message', 'notice', 'announce', 'broadcast', 'sms', 'whatsapp')) {
    return `Use Notifications → "Compose" to message everyone at once, a whole property, or one person — by SMS or WhatsApp, with a priority. You'll see read receipts (X of Y read).`
  }
  if (has(q, 'method', 'payment option', 'destination', 'accept')) {
    return `Control accepted methods and where each payment goes in Settings. Tenants only see the methods you enable, plus the bank/InnBucks/Mukuru details you provide.`
  }
  if (has(q, 'plan', 'subscription', 'upgrade', 'tier', 'capacity')) {
    return `Your plan caps how many tenants you can add. Manage it on the Plan page — pay an installment to unlock more capacity, or view the Demo to explore both sides first.`
  }
  return `I can summarise who's behind (and how much is carried over), who's paid ahead and for how long, pending approvals, collections and occupancy — or explain how to add tenants/properties, record a cash payment, or send notices. Try "who hasn't paid?", "who's paid ahead?", or ask about a specific tenant by name.`
}

function findTenant(q, tenants = []) {
  if (!tenants.length) return null
  const tokens = normalize(q).split(' ').filter((w) => w.length >= 3)
  for (const t of tenants) {
    for (const part of [t.first_name, t.last_name]) {
      const name = normalize(part)
      if (name.length < 3) continue
      // Exact substring, or a single token within 1 edit (e.g. "Farahi" → Farai).
      if (tokens.includes(name)) return t
      if (tokens.some((w) => Math.abs(w.length - name.length) <= 1 && lev(w, name) <= 1)) return t
    }
  }
  return null
}

function tenantSummaryForManager(t, ctx) {
  const payments = (ctx?.payments || [])
  const arr = computeArrears(t, payments)
  const adv = computeAdvance(t, payments)
  const status = tenantLedger(t, payments).currentStatus
  const property = (ctx?.properties || []).find((p) => p.id === t.property_id)
  let r = `${fullName(t)} — ${property?.name || 'Unassigned'}, Unit ${t.unit || '—'}\n` +
    `• Rent: ${money(t.rent)} / month · Status: ${status}`
  if (arr.total > 0) {
    r += `\n• Owing: ${money(arr.total)}${arr.broughtForward > 0 ? ` (incl. ${money(arr.broughtForward)} carried over, ${arr.monthsBehind} mo behind)` : ''}`
  } else if (adv.hasAdvance) {
    r += `\n• Paid ahead: ${money(adv.credit)} credit — covered through ${monthYear(adv.coveredThrough)}` +
      (adv.partialMonth ? `, then ${money(adv.partialAmount)} (${adv.partialPct}%) toward ${monthYear(adv.partialMonth)}` : '')
  } else {
    r += `\n• Fully paid up — nothing outstanding.`
  }
  r += `\nOpen their profile to record a payment, edit details or resend credentials.`
  return r
}
