# RentFlow

A premium, production-ready **property rental management** web app for the
Zimbabwean market. One app, two roles — **Property Manager** (landlord) and
**Tenant** — chosen on a role-picker landing screen.

Built with **Vite + React + React Router** and **Supabase** (Postgres + Auth +
RLS). WhatsApp hand-off via `wa.me` deep links; SMS OTP via **Africa's Talking**.

> **Runs with zero setup.** If no Supabase env vars are present, RentFlow boots
> in **demo mode** — a fully-functional localStorage backend with seeded data,
> so you can explore every feature immediately. Add Supabase credentials to
> switch to a real database.

---

## ✨ Features

**Manager (gold theme)**
- **Onboarding** — right after sign-up, the manager chooses an installment plan; rather than paying immediately they can open a **Demo / product tour** that previews both the **manager** and **tenant** experiences (sample data, "Manager side / Tenant side" toggle) before subscribing. An active paid plan is required to add tenants.
- Dashboard: total collected, outstanding, occupancy %, pending approvals — plus a **rent-collection donut chart** (collected vs not-yet-paid) with a **3M / 6M / 12M / All time-frame selector**
- **Plan & billing** — manager picks a tenant **capacity**; monthly price is **tiered**: ≤5 → $14 (Starter), 6–20 → $80 (Growth), 21–50 → $280 (Pro), 51–100 → $580 (Portfolio), 100+ → $700 (Enterprise). Activating a plan goes through a **card checkout** that charges the monthly installment and **saves the card on file** for future payments; the page shows the saved card, next due date, and an **installment history** with a one-click "Pay installment now". **A manager cannot add tenants without an active (paid) plan, nor more than their plan's capacity** — with no active plan the capacity is **0**, so they must subscribe and pay an installment before adding any tenant. Enforced in the data layer and the `create_tenant` SQL RPC; the UI disables "Add tenant" and prompts them to choose a plan.
- **CSV export** of payments and tenants (Excel-ready)
- **Lease documents** — attach a lease PDF/image per tenant (with lease start/end dates)
- Properties with **Vacant / Partial / All Paid** occupancy badges
- Tenants table — add/edit **all** fields (rent, unit, due day, status, credit), per-tenant history, resend credentials
- Create a tenant → auto temp password (`TEMP-XXXX`) → **WhatsApp** credential hand-off
- Payment approvals queue with a red pending badge; approve → receipt + **WhatsApp**; reject → logged
- Payments ledger with receipt view, regular/advance type, resend-WhatsApp
- Notifications to **all / a property / one tenant** with priority + read receipts (X of Y read), **plus optional WhatsApp / SMS delivery** — **one click sends the same message to everyone at once** (a single multi-recipient `sms:` link for SMS; sequential `wa.me` chats for WhatsApp), or send per-tenant. Upgradeable to fully-automated bulk via the WhatsApp Business API / Africa's Talking.

**Tenant (green theme)**
- Forced first-login flow: temp password → verify email **or** phone via 6-digit OTP → set permanent password
- Dashboard: rent, status, all-time total, **credit-balance banner**
- **Make a payment** three ways, with live advance/credit preview:
  - **Card** (Visa/Mastercard) — pay on-site
  - **EcoCash express** — enter the paying number → a PIN prompt is pushed to that phone to authorise (merchant-style)
  - **Upload proof** — Cash/Bank/InnBucks/Mukuru: attach a receipt/screenshot with a visible reference → manager approval
  - Card & EcoCash are gateway-confirmed (instant receipt); uploads go to the approvals queue
- Notification bell with unread count
- Payment history: last 12 months, toggle to **full 5-year** history, downloadable receipts
- Dashboard **paid-vs-due donut chart** (with a 3M / 6M / 12M / All time-frame selector) and a **Lease card** with downloadable lease document

**Cross-cutting**
- **White-label branding** (Growth plan and above — 10+ tenants) — the manager can set a custom **logo, app name and theme colour** that re-skin the whole app, including the portal their tenants use. Leave it blank to keep the default RentFlow design; smaller plans see an upgrade prompt.
- **Phone & email inputs** — phone fields use a searchable **all-countries dial-code picker with flags** (defaults to 🇿🇼 +263); email fields validate proper format inline
- **Phone & email inputs** — phone fields use a **country-code picker** (🇿🇼 +263 default, plus regional + global codes) and store the number in international form; email fields are **format-validated** with inline errors
- **AI assistant** — an in-app copilot for both roles (floating button). The tenant assistant answers from their own rent/balance/methods/receipts; the manager assistant summarizes arrears, approvals, occupancy and how-tos. A manager setting surfaces tenant questions in a **"Tenant questions" inbox**. Grounded demo engine out of the box; flips to **Claude (`claude-opus-4-8`)** via an Edge Function when configured.
- **Forgot password** on both sign-in screens — demo mode issues a 6-digit code to set a new password inline; real Supabase emails a recovery link that lands on `/reset-password`
- Billing periods shown as ranges everywhere — e.g. `May 2026 → Jun 2026`
- Advance payments roll into a **credit balance** auto-applied to next month
- Dark premium UI · Cormorant Garamond headings · Outfit body

---

## 🧱 Tech & structure

```
rentflow/
├─ index.html
├─ .env.example
├─ src/
│  ├─ lib/         supabaseClient, db (facade), mockDb (demo engine),
│  │               billing (periods + credit), whatsapp, phone, format
│  ├─ context/     AuthContext, ToastContext
│  ├─ components/  Modal, Field, OtpInput, Receipt, ui (StatCard/StatusPill/…)
│  └─ pages/
│     ├─ RolePicker, AuthShell
│     ├─ manager/  Layout, Dashboard, Properties, Tenants, TenantDetail,
│     │            Approvals, Payments, Notifications
│     └─ tenant/   Layout, TenantLogin, TenantVerify, Dashboard,
│                  SubmitPayment, PaymentHistory, Notifications
└─ supabase/
   ├─ migrations/  0001_schema.sql · 0002_rls.sql · 0003_functions.sql
   ├─ functions/   create-tenant/  (Edge Function for production tenant provisioning)
   └─ seed.sql
```

**The data facade (`src/lib/db.js`)** exposes one API. With Supabase env vars it
talks to Postgres + RPCs; without them it delegates to the localStorage mock.
Every UI component is backend-agnostic.

---

## 🚀 Run locally (demo mode — no accounts needed)

Requires **Node.js 18+**.

```bash
cd rentflow
npm install
npm run dev
```

Open http://localhost:5173.

Demo logins (seeded):
- **Manager:** `demo@rentflow.app` / `demo1234`
- **Tenant (active):** `rudo@example.com` / `tenant123`
- **Tenant (first login):** `tafadzwa@example.com` / `TEMP-7K2P` — walk through OTP verification
  (in demo mode the OTP is printed to the browser console and shown in a toast)

> To wipe demo data, clear the site's localStorage, or call `resetDemo()` from
> `src/lib/db.js` in the console.

---

## 🛢️ Connect a real Supabase backend

### 1. Create the project
Create a project at [supabase.com](https://supabase.com). Note the **Project URL**
and **anon public key** (Project Settings → API).

### 2. Run the migrations
In the Supabase **SQL Editor**, run in order:
1. `supabase/migrations/0001_schema.sql`
2. `supabase/migrations/0002_rls.sql`
3. `supabase/migrations/0003_functions.sql`

Or with the CLI:
```bash
supabase link --project-ref <your-ref>
supabase db push          # applies migrations/
```

### 3. Enable auth
- **Authentication → Providers → Email**: enable. For OTP, enable
  *Confirm email* / email OTP as desired.
- **Authentication → Providers → Phone**: enable if you want phone OTP. Supabase
  can route phone OTP through a custom SMS hook (see step 4).

### 4. Africa's Talking for SMS (cheaper than Twilio for Zimbabwe)
1. Create an account at [africastalking.com](https://africastalking.com) and get a
   **username** + **API key** (sandbox works for testing).
2. Provide it to the backend (never the browser):
   ```bash
   supabase secrets set AT_USERNAME=sandbox AT_API_KEY=xxxx AT_SENDER_ID=RentFlow
   ```
3. Wire SMS sending in either:
   - the `request_otp` SQL function (via `pg_net` → an Edge Function), or
   - Supabase's **Send SMS Hook** pointing at an Edge Function that calls the
     Africa's Talking REST API (`POST https://api.africastalking.com/version1/messaging`).

   The code is structured so this is the only place SMS plugs in.

### 5. Tenant provisioning Edge Function
Tenant auth accounts can't be created from the browser. Deploy the included
function:
```bash
supabase functions deploy create-tenant
```
Then point `sb.createTenant` in `src/lib/db.js` at it (a one-line swap from the
`create_tenant` RPC). See comments in `supabase/functions/create-tenant/index.ts`.

### 6. Configure env vars
```bash
cp .env.example .env
```
```dotenv
VITE_SUPABASE_URL=https://<your-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_DEFAULT_COUNTRY_CODE=263
```
Restart `npm run dev`. RentFlow now uses Supabase instead of the demo backend.

---

## 🔐 Row Level Security

Enabled on every table (`0002_rls.sql`):
- **Managers** see only rows where `manager_id = auth.uid()`.
- **Tenants** see only their own row, their own payments, their manager's
  contact card, and notifications addressed to them (all / their property /
  them individually).

Privileged actions (approve payment, OTP, mark-read) run as `SECURITY DEFINER`
RPCs so tenants/managers never get broader table grants than they should.

---

## 📲 WhatsApp integration

`src/lib/whatsapp.js` builds `https://wa.me/<intl-phone>?text=<encoded>` links
for credential hand-off and receipts. Phone numbers are normalised to
international format (`0772…` → `263772…`). `sendWhatsApp()` is the single seam —
swap its body for the **WhatsApp Business Cloud API** later without touching any
caller.

---

## 💳 Online payments (going live)

`src/lib/payments.js` is the single seam for online payments — `chargeCard`,
`initiateEcocash`, `pollEcocash`. In demo mode it **simulates** a gateway so the
full UX works with no credentials (card `4242 4242 4242 4242` succeeds,
`4000 0000 0000 0002` declines; an EcoCash number ending `0000` declines).

For production, **Paynow** is the natural fit for Zimbabwe — it offers EcoCash
*express checkout* (pushes a PIN prompt to the payer's phone) and card payments:

1. Create a merchant account + integration at **paynow.co.zw**, get the
   Integration ID + Key.
2. Hold them server-side only: `supabase secrets set PAYNOW_INTEGRATION_ID=… PAYNOW_INTEGRATION_KEY=…`
3. Swap the bodies of `chargeCard` / `initiateEcocash` / `pollEcocash` to call
   Paynow (via an Edge Function so the key never reaches the browser). Callers
   don't change.
4. Set `VITE_PAYMENTS_PROVIDER=paynow`.
5. Gateway confirmation (webhook → Edge Function) flips the payment to
   `approved` and issues the receipt; `submitOnlinePayment` inserts the pending
   record. (RLS forbids the browser from self-approving.)

**Payment proofs** (the upload path) store a data URL in demo mode. In
production, create a Supabase **Storage** bucket (e.g. `proofs`), upload the
file there, and save the signed/public URL in `payments.proof_url`.

## 🤖 AI assistant (going live)

`src/lib/ai.js` is the single seam. In demo mode it runs a **grounded rule-based
assistant** that answers from the app's real data — no API key, no network.

To use **Claude**:
1. Deploy the function: `supabase functions deploy assistant`
2. `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`
3. Set `VITE_AI_PROVIDER=anthropic` in `.env`.

The function ([supabase/functions/assistant/index.ts](rentflow/supabase/functions/assistant/index.ts)) calls
`claude-opus-4-8` with the per-user context as a grounded system prompt and the
key held server-side. The **"notify me of tenant questions"** toggle (manager
Settings) writes each tenant question to the `tenant_questions` table, which the
manager's assistant surfaces in its inbox.

## ☁️ Deploy (Vercel or Netlify)

It's a static Vite SPA. Set the two `VITE_SUPABASE_*` env vars in the host, and
add a SPA rewrite so client routes work.

**Vercel** — `vercel.json`:
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/" }] }
```
Build command `npm run build`, output `dist`.

**Netlify** — `public/_redirects`:
```
/*  /index.html  200
```
Build command `npm run build`, publish directory `dist`. Add env vars in
Site settings → Environment.

---

## 🧪 Notes & limitations

- **Demo mode stores plaintext passwords in localStorage** — it's a local
  sandbox only. Real auth is handled securely by Supabase.
- The Supabase branch of `db.js` is provided for the real backend; the demo
  branch is what runs out-of-the-box and is the fully-exercised path.
- Receipts "download" by opening a print-ready window (Save as PDF).
