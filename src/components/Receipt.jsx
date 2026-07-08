import Modal from './Modal.jsx'
import { money, fmtDate, fullName } from '../lib/format.js'
import { formatPeriod } from '../lib/billing.js'
import { IconWhatsapp } from './icons.jsx'

// Official receipt view. `onWhatsapp` (optional) shows a resend button.
export default function ReceiptModal({ payment, tenant, manager, property, onClose, onWhatsapp }) {
  const period = formatPeriod({ from: payment.period_from, to: payment.period_to })

  const download = () => {
    const html = receiptHtml({ payment, tenant, manager, property, period })
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  return (
    <Modal title="Receipt" onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Close</button>
        {onWhatsapp && <button className="btn wa" onClick={onWhatsapp}><IconWhatsapp size={16} /> Resend</button>}
        <button className="btn primary" onClick={download}>Download / Print</button>
      </>}>
      <div className="receipt">
        <div className="r-head">
          <div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', fontWeight: 700 }}>MightyRent</div>
            <div style={{ fontSize: '0.8rem', color: '#6b6258' }}>Official Rent Receipt</div>
          </div>
          <div className="r-stamp">Paid</div>
        </div>

        <div className="r-line"><span>Receipt No.</span><b>{payment.receipt_no || '—'}</b></div>
        <div className="r-line"><span>Date</span><b>{fmtDate(payment.approved_at || payment.paid_date)}</b></div>
        <div className="r-line"><span>Tenant</span><b>{fullName(tenant)}</b></div>
        {property && <div className="r-line"><span>Property</span><b>{property.name}{tenant?.unit ? ` · Unit ${tenant.unit}` : ''}</b></div>}
        <div className="r-line"><span>Billing period</span><b>{period}</b></div>
        <div className="r-line"><span>Method</span><b>{payment.method}</b></div>
        <div className="r-line"><span>Reference</span><b>{payment.reference || '—'}</b></div>
        {payment.credit_amount > 0 && (
          <div className="r-line"><span>Credit carried forward</span><b>{money(payment.credit_amount)}</b></div>
        )}

        <div className="r-line" style={{ borderBottom: 'none', marginTop: 8, alignItems: 'baseline' }}>
          <span style={{ fontWeight: 600 }}>Amount paid</span>
          <span className="r-total">{money(payment.amount)}</span>
        </div>

        <div style={{ marginTop: 16, fontSize: '0.78rem', color: '#6b6258', textAlign: 'center' }}>
          Issued by {fullName(manager)} · Thank you for your payment.
        </div>
      </div>
    </Modal>
  )
}

// Standalone HTML for the print/download window.
function receiptHtml({ payment, tenant, manager, property, period }) {
  const row = (k, v) => `<tr><td style="padding:7px 0;color:#6b6258">${k}</td><td style="padding:7px 0;text-align:right;font-weight:600">${v}</td></tr>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${payment.receipt_no || ''}</title>
  <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1714;max-width:520px;margin:40px auto;padding:0 24px}
  h1{font-family:Georgia,serif;margin:0}table{width:100%;border-collapse:collapse}
  .total{font-size:1.6rem;font-weight:800}.stamp{display:inline-block;border:2px solid #2e8b57;color:#2e8b57;padding:2px 12px;border-radius:6px;font-weight:700;text-transform:uppercase;transform:rotate(-4deg)}
  hr{border:none;border-top:2px solid #1a1714;margin:10px 0}</style></head>
  <body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div><h1>MightyRent</h1><div style="color:#6b6258;font-size:.85rem">Official Rent Receipt</div></div>
    <div class="stamp">Paid</div>
  </div><hr/>
  <table>
    ${row('Receipt No.', payment.receipt_no || '—')}
    ${row('Date', fmtDate(payment.approved_at || payment.paid_date))}
    ${row('Tenant', fullName(tenant))}
    ${property ? row('Property', property.name + (tenant?.unit ? ' · Unit ' + tenant.unit : '')) : ''}
    ${row('Billing period', period)}
    ${row('Method', payment.method)}
    ${row('Reference', payment.reference || '—')}
    ${payment.credit_amount > 0 ? row('Credit carried forward', money(payment.credit_amount)) : ''}
  </table><hr/>
  <table><tr><td style="font-weight:600">Amount paid</td><td style="text-align:right" class="total">${money(payment.amount)}</td></tr></table>
  <p style="margin-top:24px;color:#6b6258;font-size:.8rem;text-align:center">Issued by ${fullName(manager)} · Thank you for your payment.</p>
  </body></html>`
}
