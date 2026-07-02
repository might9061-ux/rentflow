# RentFlow API server

A small Express backend that sits in front of Supabase. It holds the secret
**service-role key** (so it can create tenant/staff login accounts, which a
browser can't do safely) and runs every other operation **under the caller's
Row Level Security**, so one workspace can never see another's data.

The frontend uses this server automatically when `VITE_API_URL` is set (see
"Connect the frontend" below). Otherwise the app talks to Supabase directly.

## What it exposes

```
GET    /health                                   (public) is the server up?

# everything below needs a Bearer token = the user's Supabase session token
POST   /api/admin/tenants                        create tenant login + profile → { tenant_id, temp_password }
POST   /api/admin/tenants/:id/resend-credentials reset a tenant's password
POST   /api/admin/staff                          create a staff manager account
POST   /api/admin/staff/:id/reset-password       reset a staff password

GET    /api/managers/me            PATCH /api/managers/me
GET    /api/managers/team          PATCH/DELETE /api/managers/team/:id
GET    /api/properties  POST /   PATCH/DELETE /:id
GET    /api/tenants     GET /:id  PATCH/DELETE /:id
GET    /api/payments    POST /   POST /log   POST /:id/approve   POST /:id/reject
GET    /api/payments/tenant/:tenantId
GET    /api/notifications  POST /   POST /:id/read
GET    /api/maintenance    POST /   PATCH /:id
GET    /api/expenses       POST /   DELETE /:id
```

## Run it (Windows / Command Prompt)

```
cd C:\Users\might\Downloads\Assingment\rentflow\server
copy .env.example .env
```

Then open `.env` and fill in three values from your Supabase dashboard
(**Project Settings → API**):

- `SUPABASE_URL` — Project URL
- `SUPABASE_ANON_KEY` — the `anon` `public` key
- `SUPABASE_SERVICE_ROLE_KEY` — the `service_role` `secret` key ⚠️ keep private

Then:

```
npm install
npm run dev
```

You should see `listening on http://localhost:8787`. Check it:
open `http://localhost:8787/health` → `{"ok":true,...}`.

## Connect the frontend

In the project root `.env` (the one next to `package.json`, not this folder's),
add:

```
VITE_API_URL=http://localhost:8787
```

Restart `npm run dev` for the frontend. It will now route the core resources and
account-creation through this server. To go back to the direct-Supabase path,
remove that line and restart.

## Security notes

- The **service-role key never leaves this server** — never put it in the
  frontend `.env` (anything prefixed `VITE_` is shipped to the browser).
- Normal data reads/writes use the caller's token, so **RLS still applies**.
- Only the four `/api/admin/*` routes use the service-role key, and each first
  checks the caller and scopes the action to their workspace.

## Deploying later

Host this on any Node platform (Render, Railway, Fly, a VPS). Set the same env
vars there, set `CORS_ORIGINS` to your real frontend domain, and point the
frontend's `VITE_API_URL` at the deployed URL.
