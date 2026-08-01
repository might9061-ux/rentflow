import { useState } from 'react'
import Modal from './Modal.jsx'
import { money, fmtDate, fullName } from '../lib/format.js'
import { formatPeriod } from '../lib/billing.js'
import { shareReceiptImage } from '../lib/receiptImage.js'
import { IconWhatsapp, IconShare } from './icons.jsx'

// Official receipt view. `onWhatsapp` (optional) shows a resend button.
export default function ReceiptModal({ payment, tenant, manager, property, onClose, onWhatsapp }) {
  const period = formatPeriod({ from: payment.period_from, to: payment.period_to })
  const [sharing, setSharing] = useState(false)
  // Paper size for printing. 80mm / 58mm = thermal receipt-printer rolls used in
  // shops; A4 = a normal office printer. Remembered so it's a one-time choice.
  const [paper, setPaper] = useState(() => { try { return localStorage.getItem('rentflow_receipt_paper') || '80mm' } catch { return '80mm' } })
  const brand = { brandName: manager?.brand_name || 'RentLoja', brandColor: manager?.brand_color || '#c8a84b' }

  const print = () => {
    try { localStorage.setItem('rentflow_receipt_paper', paper) } catch { /* ignore */ }
    const html = paper === 'a4'
      ? receiptHtml({ payment, tenant, manager, property, period })
      : receiptThermalHtml({ payment, tenant, manager, property, period, brand, widthMm: paper === '58mm' ? 58 : 80 })
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  // Share as a PNG image — native sheet on mobile, download on desktop.
  const shareImage = async () => {
    setSharing(true)
    try { await shareReceiptImage({ payment, tenant, manager, property, ...brand }) }
    catch { /* user cancelled or unsupported — download path already handled */ }
    finally { setSharing(false) }
  }

  return (
    <Modal title="Receipt" onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Close</button>
        {onWhatsapp && <button className="btn wa" onClick={onWhatsapp}><IconWhatsapp size={16} /> Resend</button>}
        <button className="btn ghost" onClick={shareImage} disabled={sharing}><IconShare size={16} /> {sharing ? 'Preparing…' : 'Share image'}</button>
        <select className="select" value={paper} onChange={(e) => setPaper(e.target.value)} title="Receipt paper size"
          style={{ width: 'auto', padding: '0 10px' }}>
          <option value="80mm">80mm receipt printer</option>
          <option value="58mm">58mm receipt printer</option>
          <option value="a4">A4 / normal printer</option>
        </select>
        <button className="btn primary" onClick={print}>Print</button>
      </>}>
      <div className="receipt">
        <div className="r-head">
          <div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', fontWeight: 700 }}>{brand.brandName}</div>
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

// Thermal receipt layout for shop-style receipt printers (80mm / 58mm rolls).
// Monospace, pure black, continuous-roll page size — what those printers expect.
// The manager picks the printer in the browser's print dialog.
function receiptThermalHtml({ payment, tenant, manager, property, period, brand, widthMm }) {
  const line = (k, v) => `<div class="ln"><span>${k}</span><b>${v}</b></div>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${payment.receipt_no || ''}</title>
  <style>
    @page { size: ${widthMm}mm auto; margin: 3mm; }
    * { box-sizing: border-box; }
    body { width: ${widthMm - 6}mm; margin: 0 auto; color: #000;
      font-family: 'Courier New', ui-monospace, monospace; font-size: 12px; line-height: 1.45; }
    .center { text-align: center; }
    .brand { font-weight: 700; font-size: 15px; }
    hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
    .ln { display: flex; justify-content: space-between; gap: 8px; }
    .ln b { text-align: right; font-weight: 700; }
    .total { display: flex; justify-content: space-between; font-weight: 700; font-size: 14px; margin-top: 4px; }
    .foot { text-align: center; margin-top: 8px; font-size: 11px; }
  </style></head><body>
  <div class="center"><div class="brand">${brand.brandName}</div><div>Official Rent Receipt</div></div>
  <hr/>
  ${line('Receipt No', payment.receipt_no || '—')}
  ${line('Date', fmtDate(payment.approved_at || payment.paid_date))}
  ${line('Tenant', fullName(tenant))}
  ${property ? line('Property', property.name + (tenant?.unit ? ' Unit ' + tenant.unit : '')) : ''}
  ${line('Period', period)}
  ${line('Method', payment.method || '—')}
  ${line('Ref', payment.reference || '—')}
  ${payment.credit_amount > 0 ? line('Credit fwd', money(payment.credit_amount)) : ''}
  <hr/>
  <div class="total"><span>AMOUNT PAID</span><span>${money(payment.amount)}</span></div>
  <hr/>
  <div class="foot">Issued by ${fullName(manager)}<br/>Thank you for your payment.</div>
  </body></html>`
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
    <div><h1>RentLoja</h1><div style="color:#6b6258;font-size:.85rem">Official Rent Receipt</div></div>
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
