import { Link } from 'react-router-dom'

// Public Terms of Service. Reachable at /terms (rentloja.com/terms) and linked
// from the sign-up consent and the app footer.
export default function Terms() {
  const updated = 'July 2026'
  return (
    <div className="page" style={{ maxWidth: 780, margin: '0 auto', padding: '40px 22px 80px' }}>
      <div style={{ marginBottom: 8 }}>
        <Link to="/" className="link-btn" style={{ fontSize: '0.86rem' }}>← Back to RentLoja</Link>
      </div>
      <div className="eyebrow" style={{ color: 'var(--gold)' }}>RentLoja</div>
      <h1 style={{ marginTop: 6 }}>Terms &amp; Conditions</h1>
      <p className="muted" style={{ marginTop: 4 }}>Last updated: {updated}</p>

      <div className="legal-body">
        <p>
          These Terms &amp; Conditions (“Terms”) govern your use of RentLoja (“we”, “us”), a property‑rental
          management service for property managers and their tenants. By creating an account, subscribing, or
          otherwise using RentLoja, you agree to these Terms and to our <Link to="/privacy">Privacy Policy</Link>.
          If you do not agree, do not use the service.
        </p>

        <h3>1. The service</h3>
        <p>
          RentLoja helps property managers record rent, issue receipts, manage tenants and properties, and lets
          tenants pay and track their rent. Features may change, improve, or be discontinued over time.
        </p>

        <h3>2. Accounts &amp; eligibility</h3>
        <p>
          You must be 18 or older and provide accurate details. You are responsible for keeping your login secure
          and for all activity under your account. A property manager is responsible for the tenant and property
          records they create, and for having the right to enter that information.
        </p>

        <h3>3. Free trial</h3>
        <p>
          New property‑manager accounts include a <b>7‑day free trial</b>. During the trial you can use the
          manager features to set up properties and tenants. Unless you subscribe to a paid plan before the trial
          ends, paid features (including adding or managing tenants beyond the trial) stop when the trial expires.
          One trial per manager.
        </p>

        <h3>4. Subscriptions &amp; billing</h3>
        <p>
          Paid plans are billed <b>monthly in advance</b>. The price depends on the tenant capacity you choose and
          steps up by tier, as shown on the Plan &amp; billing page. By subscribing you authorise us (and our
          payment provider) to charge your chosen payment method the applicable monthly fee, including at the end
          of any free trial and on each renewal, until you cancel.
        </p>

        <h3 style={{ color: 'var(--gold)' }}>5. No refunds</h3>
        <p>
          <b>All fees are non‑refundable.</b> Except where refunds are required by applicable law, we do not provide
          refunds or credits for any subscription fees already paid, for partially used billing periods, for
          unused capacity, or for periods in which you did not use the service. Cancelling stops future charges but
          does not refund amounts already paid.
        </p>

        <h3>6. Cancelling your membership</h3>
        <p>
          You can cancel your subscription at any time from <b>Plan &amp; billing</b> in your account. Cancellation
          stops future monthly charges. Your paid features remain available until the end of the period you have
          already paid for, after which the account reverts to the free (no active plan) state. As stated above,
          no refund is given for the current or any past period. Your data is retained per our Privacy Policy so
          you can resubscribe later.
        </p>

        <h3>7. Acceptable use</h3>
        <p>You agree not to misuse the service — including no unlawful use, no attempting to breach security or
          access data that isn’t yours, no uploading of unlawful content, and no use that harms the service or
          other users.</p>

        <h3>8. Payments to and from tenants</h3>
        <p>
          RentLoja records rent payments and, where enabled, helps process online payments through third‑party
          providers. We are not a party to the tenancy agreement between a manager and a tenant and are not
          responsible for the underlying rent obligations, disputes, or the conduct of managers or tenants.
        </p>

        <h3>9. Service availability</h3>
        <p>We aim to keep RentLoja available and accurate, but the service is provided “as is” without warranties
          of any kind. We do not guarantee uninterrupted or error‑free operation.</p>

        <h3>10. Limitation of liability</h3>
        <p>To the maximum extent permitted by law, RentLoja is not liable for indirect, incidental, or
          consequential losses, or for lost rent, profits, or data. Our total liability for any claim relating to
          the service is limited to the amount you paid us in the three months before the claim.</p>

        <h3>11. Changes to these Terms</h3>
        <p>We may update these Terms from time to time. Material changes take effect when posted, shown by the
          “Last updated” date above. Continuing to use RentLoja after a change means you accept the updated Terms.</p>

        <h3>12. Governing law</h3>
        <p>These Terms are governed by the laws of Zimbabwe, without regard to conflict‑of‑laws rules.</p>

        <h3>13. Contact</h3>
        <p>Questions about these Terms? Email <a href="mailto:support@rentloja.com">support@rentloja.com</a>.</p>
      </div>

      <style>{`
        .legal-body { margin-top: 22px; line-height: 1.7; color: var(--text-dim); }
        .legal-body h3 { margin: 26px 0 8px; color: var(--text); font-size: 1.15rem; }
        .legal-body p { margin: 10px 0; }
        .legal-body a { color: var(--gold); }
        .legal-body b { color: var(--text); }
      `}</style>
    </div>
  )
}
