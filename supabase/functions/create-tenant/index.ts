// ═══════════════════════════════════════════════════════════════════════════
// Supabase Edge Function — create-tenant  (PRODUCTION reference)
//
// The demo build provisions tenants entirely client-side via the mock backend.
// For a real deployment you cannot create auth users from the browser, so this
// Edge Function does it with the service_role key.
//
// Deploy:
//   supabase functions deploy create-tenant --no-verify-jwt=false
//   supabase secrets set AT_API_KEY=... AT_USERNAME=... AT_SENDER_ID=RentFlow
//
// The frontend (lib/db.js, sb.createTenant) can be pointed at this function
// instead of the create_tenant RPC when you go live.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function tempPassword() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)]
  return `TEMP-${s}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Identify the calling manager from their JWT.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Unauthorized' }, 401)

    const body = await req.json()
    const pw = tempPassword()

    // 1. Create the tenant auth account with the temp password.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: body.email,
      password: pw,
      email_confirm: true, // they verify via OTP in-app
      user_metadata: { role: 'tenant', first_name: body.first_name, last_name: body.last_name },
    })
    if (createErr) return json({ error: createErr.message }, 400)

    const tenantId = created.user.id

    // 2. Create the tenant profile row (manager_id taken from the JWT).
    const { error: profileErr } = await admin.from('tenants').insert({
      id: tenantId, manager_id: user.id, property_id: body.property_id ?? null,
      first_name: body.first_name, last_name: body.last_name, email: body.email,
      phone: body.phone, unit: body.unit, rent: body.rent, due_day: body.due_day,
      lease_start: body.lease_start ?? null, status: 'pending',
      account_status: 'pending_verification', first_login: true,
      email_verified: false, phone_verified: false,
    })
    if (profileErr) {
      await admin.auth.admin.deleteUser(tenantId) // rollback
      return json({ error: profileErr.message }, 400)
    }

    return json({ tenant_id: tenantId, temp_password: pw }, 200)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
