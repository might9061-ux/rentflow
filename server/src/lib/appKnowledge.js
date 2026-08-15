// What the Copilot knows ABOUT RentLoja itself (features, pricing, how-tos),
// separate from the caller's own account DATA. Included in the assistant's
// system prompt so it can answer "what is RentLoja?", "how much does it cost?",
// "how do I connect online payments?", "how do I add a tenant?" and the like.
//
// Keep this accurate and in sync with the app — it's the single source the AI
// quotes from. Concise on purpose: it's added to every request.
export const APP_KNOWLEDGE = `
ABOUT RENTLOJA
RentLoja is a property-rental management app for Zimbabwe and Africa. Property
managers (landlords) manage properties, units and tenants, collect and track
rent, and issue receipts — all in one place. Tenants get a simple portal to pay
rent, see their balance, and keep every receipt.

PRICING & FREE MONTH
- New managers get a FREE FIRST MONTH: pick a plan size (how many tenants), with
  no card and no charge. Billing begins only after the free month ends.
- Plans are priced by tenant capacity, from about $10/month, stepping up by tier
  (up to 200 tenants = $70/month). Above 200, just type your exact tenant count —
  the price is $70 plus $0.20 per tenant above 200 (e.g. 1000 tenants ≈ $230/mo).
  Billable monthly or yearly. One free month per manager.
- Tenants never pay RentLoja anything — the manager's subscription covers the
  whole workspace (including all its tenants and agents).

GETTING PAID (rent)
- Manual: tenants pay by EcoCash, InnBucks, Cash USD, Bank Transfer or Mukuru and
  upload proof; the manager approves it and a receipt is issued automatically.
- Online (instant): a manager can connect Pesepay so tenants pay by card or
  EcoCash online, straight to the manager. The landlord receives the full rent;
  RentLoja takes only a small 0.5% split. To connect: register a business at
  pesepay.com, wait for Pesepay's approval email, tell RentLoja the email you
  registered with (WhatsApp +263 773 677 343 or rentloja@gmail.com), and accept
  the 0.5% split agreement on Pesepay. Full fee details are in the Terms.

FOR MANAGERS — features & how-to
- Properties: add a property and name its units.
- Tenants: add a tenant (this creates their login; hand over the temporary
  password by WhatsApp — once they set their own password the temp key is hidden).
- Payments: record a cash/manual payment, or approve a tenant's uploaded proof;
  receipts are automatic. Balances update from the actual payments (a partial
  payment reduces what's owed).
- Reminders: send rent reminders by WhatsApp or SMS before and after due dates.
- Maintenance: tenants raise repair requests; the manager triages, assigns a
  caretaker, logs a cost and resolves them (the cost becomes a property expense).
- Messages: chat with tenants and agents; each message shows the sender's role
  and name (Manager/Agent/Tenant).
- Agents: invite staff to help run assigned properties; the owner controls their
  access, and agents never see billing/subscription.
- Branding (Growth plans, 10+ tenants): put your own name, logo and colour across
  the app and the tenant portal.
- Finances: collections, arrears, advances (paid-ahead credit) and expenses.

FOR TENANTS — what you can do
- Pay rent (online where the manager enabled it, or upload proof of a manual
  payment), see your balance, any arrears carried over, and any credit if you've
  paid ahead.
- Keep every receipt and view your payment history.
- Raise maintenance requests and message your property manager.

SUPPORT
- Managers: WhatsApp +263 773 677 343 (fastest) or email rentloja@gmail.com.
- Tenants: contact your own property manager — they handle your account and
  payments (RentLoja support is for managers).
- The Terms & agreement page covers fees, the online-payment split, and the free
  month in detail.
`.trim()
