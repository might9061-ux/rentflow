// ═══════════════════════════════════════════════════════════════════════════
// Supabase Edge Function — assistant  (PRODUCTION reference)
//
// Backs the manager & tenant AI copilots when VITE_AI_PROVIDER=anthropic.
// The browser calls supabase.functions.invoke('assistant', { body }); this
// function calls Claude server-side so the ANTHROPIC_API_KEY never reaches the
// client.
//
// Deploy:
//   supabase functions deploy assistant
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// ═══════════════════════════════════════════════════════════════════════════

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.69.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

function systemPrompt(role: string, context: any) {
  // The client sends pre-computed `facts` (arrears, advance, collections,
  // occupancy…). Prefer those; they are the grounded source of truth.
  const facts = context?.facts ?? context ?? {}
  const capability = role === 'manager'
    ? `You can summarise outstanding rent (including balances carried over from previous months), who's ` +
      `paid ahead and how long their credit lasts, pending approvals, collections and occupancy; and ` +
      `explain how to add tenants/properties, record a cash payment, or send notices.`
    : `You can explain this tenant's rent, balance, any arrears carried over, credit/advance and how long ` +
      `it lasts, how and where to pay, receipts, and verification.`
  return [
    `You are RentFlow Copilot, an expert assistant embedded in RentFlow — a property-rental management ` +
      `app built for the African market. You are helping a ${role}.`,
    `Be concise, warm and practical. Use USD and Zimbabwean payment methods (EcoCash, InnBucks, Cash USD, ` +
      `Bank Transfer, Mukuru). Prefer short sentences and tight bullet lists; use first names when natural.`,
    `Ground EVERY answer in the DATA below. Never invent figures, names, tenants or account details. You ` +
      `may do arithmetic on the numbers given. If the answer isn't in the data, say so and point to where ` +
      `in the app to look` + (role === 'tenant' ? ', or suggest contacting their property manager.' : '.'),
    capability,
    '',
    'DATA (JSON):',
    JSON.stringify(facts, null, 2),
  ].join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { role, message, context, history = [] } = await req.json()

    const messages = [
      ...history.map((m: { role: string; text: string }) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      })),
      { role: 'user', content: message },
    ]

    const resp = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      system: systemPrompt(role, context),
      messages,
    })

    const reply = resp.content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('\n')

    return new Response(JSON.stringify({ reply }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
