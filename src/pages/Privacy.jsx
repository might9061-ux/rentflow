import { Link } from 'react-router-dom'

// Public privacy policy — needed for the Google Play Store listing and general
// transparency. Reachable at /privacy (rentloja.com/privacy).
export default function Privacy() {
  const updated = 'July 2026'
  return (
    <div className="page" style={{ maxWidth: 780, margin: '0 auto', padding: '40px 22px 80px' }}>
      <div style={{ marginBottom: 8 }}>
        <Link to="/" className="link-btn" style={{ fontSize: '0.86rem' }}>← Back to RentLoja</Link>
      </div>
      <div className="eyebrow" style={{ color: 'var(--gold)' }}>RentLoja</div>
      <h1 style={{ marginTop: 6 }}>Privacy Policy</h1>
      <p className="muted" style={{ marginTop: 4 }}>Last updated: {updated}</p>

      <div className="privacy-body">
        <p>
          RentLoja (“we”, “us”) provides property‑rental management software that helps property
          managers and their tenants handle rent, receipts and records. This policy explains what
          information we collect, how we use it, and your choices. By using RentLoja you agree to this policy.
        </p>

        <h3>Information we collect</h3>
        <ul>
          <li><b>Account details</b> — your name, email address, and phone number, used to create and secure your account.</li>
          <li><b>Tenancy details</b> — property, unit, rent amount, lease dates and related records (entered by property managers).</li>
          <li><b>Payment records</b> — amounts, method (e.g. EcoCash, bank transfer, card), references and receipts. We do <b>not</b> store full card numbers; card payments are handled by the payment provider.</li>
          <li><b>Verification codes</b> — one‑time codes sent to your email or phone to confirm it’s you.</li>
          <li><b>Basic usage/device data</b> — standard technical information (e.g. browser type) needed to run the service securely.</li>
        </ul>

        <h3>How we use your information</h3>
        <ul>
          <li>To provide the rent‑management service — recording payments, issuing receipts, and showing balances.</li>
          <li>To verify your identity and secure your account (email/SMS one‑time codes).</li>
          <li>To send you account and rent notifications (e.g. reminders, approvals).</li>
          <li>To maintain, protect and improve the service.</li>
        </ul>

        <h3>How your information is shared</h3>
        <p>We do <b>not</b> sell your personal information. We share it only with service providers that help us run RentLoja:</p>
        <ul>
          <li><b>Supabase</b> — secure database and authentication hosting.</li>
          <li><b>Resend</b> — sending verification and notification emails.</li>
          <li><b>Africa’s Talking</b> — sending SMS verification codes.</li>
          <li><b>Payment providers</b> — processing online payments where used.</li>
        </ul>
        <p>Within the app, a tenant’s information is visible only to their own property manager (and any staff that manager authorises). We may also disclose information if required by law.</p>

        <h3>Data security</h3>
        <p>Information is transmitted over encrypted connections (HTTPS) and access is restricted by role‑based rules. No system is perfectly secure, but we take reasonable measures to protect your data.</p>

        <h3>Data retention</h3>
        <p>We keep your information while your account is active or as needed to provide the service and meet legal/record‑keeping obligations. You can request deletion of your account and personal data (see Contact).</p>

        <h3>Your rights</h3>
        <p>You may request to access, correct, or delete your personal information. Property managers control the tenancy records they create; contact your property manager for those, or contact us for account‑level requests.</p>

        <h3>Children</h3>
        <p>RentLoja is intended for adults (18+) and is not directed at children.</p>

        <h3>Changes to this policy</h3>
        <p>We may update this policy from time to time. Material changes will be reflected by the “Last updated” date above.</p>

        <h3>Contact</h3>
        <p>Questions or requests about your privacy? Email <a href="mailto:support@rentloja.com">support@rentloja.com</a>.</p>
      </div>

      <style>{`
        .privacy-body { margin-top: 22px; line-height: 1.7; color: var(--text-dim); }
        .privacy-body h3 { margin: 26px 0 8px; color: var(--text); font-size: 1.15rem; }
        .privacy-body p { margin: 10px 0; }
        .privacy-body ul { margin: 8px 0 8px 4px; padding-left: 18px; }
        .privacy-body li { margin: 6px 0; }
        .privacy-body a { color: var(--gold); }
        .privacy-body b { color: var(--text); }
      `}</style>
    </div>
  )
}
