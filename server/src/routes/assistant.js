// ═══════════════════════════════════════════════════════════════════════════
// RentLoja Copilot — real Claude answers, server-side.
//
// The API key lives here and never reaches the browser. Crucially, the system
// prompt is built HERE, not accepted from the client: the previous design had
// the browser POST its own `system` string, which would have let anyone who
// found this endpoint use the key as a general-purpose Claude proxy at our
// expense. The client may only send a role, a question, and the facts about
// its own account.
//
// Those facts are computed client-side and taken on trust. That's acceptable
// because they only describe the caller's OWN tenancy or workspace — a forged
// fact misleads the forger and nobody else — but they're size-capped so a
// crafted payload can't burn tokens.
// ═══════════════════════════════════════════════════════════════════════════
import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { h } from '../auth.js'

const router = Router()

// Answers are short by design — this is a chat bubble, not a document. Thinking
// is left off (the default on this model): the facts are already computed, so
// the model is phrasing an answer, not reasoning through a problem, and a chat
// widget should feel instant.
const MODEL = process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-4-8'
const MAX_TOKENS = 1024

// Abuse limits. A tenant asking about their rent needs a handful of messages;
// anything past this is a script.
const MAX_MESSAGE_CHARS = 2000
const MAX_HISTORY = 10
const MAX_FACTS_CHARS = 8000
const RATE_LIMIT = 40          // messages…
const RATE_WINDOW_MS = 60 * 60 * 1000  // …per user per hour

const hits = new Map() // userId -> { count, resetAt }

function rateLimited(userId) {
  const now = Date.now()
  const e = hits.get(userId)
  if (!e || e.resetAt <= now) {
    hits.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS })
    if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k)
    return false
  }
  e.count += 1
  return e.count > RATE_LIMIT
}

export function assistantConfigured() { return !!process.env.ANTHROPIC_API_KEY }

// Built here so the model's instructions can't be rewritten by a caller.
function systemPrompt(role, facts) {
  const persona = 'You are RentLoja Copilot, an assistant inside RentLoja — a property-rental '
    + `management app built for the Zimbabwean market. You are helping a ${role}.`
  const style = 'Be warm, brief and practical. Amounts are USD unless the data says otherwise. '
    + 'Zimbabwean payment methods are EcoCash, InnBucks, Cash USD, Bank Transfer and Mukuru. '
    + 'Short sentences, plain language, no jargon. Use their first name when it fits. '
    + 'Answer in at most a short paragraph or a few bullets.'
  const grounding = 'Ground EVERY answer in the DATA below. Never invent figures, names, dates or '
    + 'account details — a wrong rent figure erodes trust in the whole product. You may do '
    + 'arithmetic on the numbers given. If the answer is not in the data, say so plainly and say '
    + (role === 'tenant' ? 'they can ask their property manager.' : 'where in the app to look.')
  const scope = role === 'tenant'
    ? 'You can explain this tenant\'s rent, balance, arrears carried over, credit and how long it '
      + 'lasts, how and where to pay, receipts, and verification. You only ever know about THIS '
      + 'tenant — never discuss other tenants, and never reveal anything not in the data.'
    : 'You can summarise outstanding rent, who is behind and by how much, who has paid ahead, '
      + 'pending approvals, collections and occupancy, and explain how to add tenants or '
      + 'properties, record a cash payment, or send notices.'
  const guard = 'Only answer questions about this RentLoja account and how to use RentLoja. If '
    + 'asked for anything else — general knowledge, code, essays, other people\'s data — politely '
    + 'decline and steer back to their rent or account.'

  return [persona, style, grounding, scope, guard, '', 'DATA (JSON):', JSON.stringify(facts ?? {}, null, 2)].join('\n')
}

// POST /api/assistant — one Copilot turn.
router.post('/', h(async (req, res) => {
  if (!assistantConfigured()) {
    return res.status(503).json({ error: 'The assistant is not switched on for this server.' })
  }
  if (rateLimited(req.user.id)) {
    return res.status(429).json({ error: 'That\'s a lot of questions! Please try again later.' })
  }

  const role = req.body?.role === 'manager' ? 'manager' : 'tenant'
  const message = String(req.body?.message || '').slice(0, MAX_MESSAGE_CHARS).trim()
  if (!message) throw new Error('Ask a question first.')

  // Facts are the caller's own account data, capped so they can't be used to
  // inflate token spend.
  let facts = req.body?.facts ?? {}
  if (JSON.stringify(facts).length > MAX_FACTS_CHARS) facts = { note: 'account data too large to include' }

  const history = (Array.isArray(req.body?.history) ? req.body.history : [])
    .slice(-MAX_HISTORY)
    .map((m) => ({
      role: m?.role === 'user' ? 'user' : 'assistant',
      content: String(m?.text || '').slice(0, MAX_MESSAGE_CHARS),
    }))
    .filter((m) => m.content)

  const client = new Anthropic() // reads ANTHROPIC_API_KEY

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt(role, facts),
      messages: [...history, { role: 'user', content: message }],
    })

    // A safety decline arrives as a normal 200 — check before reading content.
    if (response.stop_reason === 'refusal') {
      return res.json({ reply: 'Sorry, I can\'t help with that one. Ask me about your rent, balance or how to pay.' })
    }

    const reply = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    res.json({
      reply: reply || 'Sorry, I didn\'t catch that. Could you rephrase?',
      usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
    })
  } catch (err) {
    // Never surface a raw provider error (or anything key-shaped) to the browser.
    if (err instanceof Anthropic.RateLimitError) {
      console.error('[assistant] rate limited by Anthropic')
      return res.status(429).json({ error: 'The assistant is busy right now. Please try again in a moment.' })
    }
    if (err instanceof Anthropic.AuthenticationError) {
      console.error('[assistant] ANTHROPIC_API_KEY rejected — check the key on the server')
      return res.status(503).json({ error: 'The assistant is unavailable right now.' })
    }
    console.error('[assistant] failed:', err?.message || err)
    return res.status(502).json({ error: 'The assistant could not answer just now. Please try again.' })
  }
}))

export default router
