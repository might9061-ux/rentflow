// Tenant statements — download as CSV or print to PDF, no third-party library.
//
// The rows come straight from the approved payment records (the source of
// truth), so a statement always reconciles with what the ledger shows.
import { money, fullName, fmtDate } from './format.js'

// One row per approved payment, newest first.
function paymentRows(payments = []) {
  return payments
    .filter((p) => p.status === 'approved')
    .sort((a, b) => new Date(b.paid_date || b.created_at) - new Date(a.paid_date || a.created_at))
    .map((p) => ({
      date: fmtDate(p.paid_date || p.created_at),
      method: p.method || '—',
      reference: p.receipt_no || p.reference || p.gateway_ref || '',
      period: p.period_from ? `${fmtDate(p.period_from)}${p.period_to ? ` – ${fmtDate(p.period_to)}` : ''}` : '',
      amount: Number(p.amount) || 0,
    }))
}

// ── CSV ──────────────────────────────────────────────────────────────────────
function csvCell(v) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function statementCsv(tenant, payments) {
  const rows = paymentRows(payments)
  const header = ['Date', 'Method', 'Reference', 'Period', 'Amount']
  const lines = [header, ...rows.map((r) => [r.date, r.method, r.reference, r.period, r.amount.toFixed(2)])]
  const total = rows.reduce((s, r) => s + r.amount, 0)
  lines.push([]) // blank line
  lines.push(['', '', '', 'Total', total.toFixed(2)])
  return lines.map((cols) => cols.map(csvCell).join(',')).join('\r\n')
}

export function downloadStatementCsv(tenant, payments) {
  const csv = statementCsv(tenant, payments)
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }) // BOM so Excel reads UTF-8
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `statement-${slug(fullName(tenant))}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Printable statement (opens a clean page → browser "Save as PDF") ─────────
export function printStatement(tenant, payments, { brandName = 'RentLoja', brandColor = '#c8a84b', workspace } = {}) {
  const rows = paymentRows(payments)
  const total = rows.reduce((s, r) => s + r.amount, 0)
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

  const html = `<!doctype html><html><head><meta charset="utf-8">
    <title>Statement — ${esc(fullName(tenant))}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #1a1a1a; margin: 40px; }
      .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${esc(brandColor)}; padding-bottom: 16px; margin-bottom: 24px; }
      .brand { font-size: 22px; font-weight: 700; color: ${esc(brandColor)}; }
      .doc { text-align: right; }
      .doc h1 { margin: 0; font-size: 20px; letter-spacing: 1px; text-transform: uppercase; }
      .doc .muted { color: #666; font-size: 13px; }
      .meta { display: flex; gap: 40px; margin-bottom: 22px; font-size: 14px; }
      .meta b { display: block; color: #666; font-weight: 500; font-size: 12px; text-transform: uppercase; margin-bottom: 3px; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      th { text-align: left; border-bottom: 2px solid #ddd; padding: 9px 8px; color: #666; font-size: 12px; text-transform: uppercase; }
      td { padding: 9px 8px; border-bottom: 1px solid #eee; }
      .r { text-align: right; }
      tfoot td { border-top: 2px solid #333; border-bottom: none; font-weight: 700; padding-top: 12px; font-size: 15px; }
      .foot { margin-top: 34px; color: #999; font-size: 12px; text-align: center; }
      @media print { body { margin: 0; padding: 24px; } .noprint { display: none; } }
    </style></head><body>
    <div class="head">
      <div class="brand">${esc(brandName)}</div>
      <div class="doc"><h1>Statement</h1><div class="muted">Generated ${esc(fmtDate(new Date()))}</div></div>
    </div>
    <div class="meta">
      <div><b>Tenant</b>${esc(fullName(tenant))}${tenant.unit ? `<br>Unit ${esc(tenant.unit)}` : ''}</div>
      <div><b>Contact</b>${esc(tenant.phone || '')}${tenant.email ? `<br>${esc(tenant.email)}` : ''}</div>
      <div><b>Monthly rent</b>${esc(money(tenant.rent))}</div>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th>Period</th><th class="r">Amount</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map((r) => `<tr>
          <td>${esc(r.date)}</td><td>${esc(r.method)}</td><td>${esc(r.reference)}</td>
          <td>${esc(r.period)}</td><td class="r">${esc(money(r.amount))}</td></tr>`).join('')
          : '<tr><td colspan="5" style="text-align:center;color:#999;padding:24px">No payments recorded yet.</td></tr>'}
      </tbody>
      ${rows.length ? `<tfoot><tr><td colspan="4">Total paid</td><td class="r">${esc(money(total))}</td></tr></tfoot>` : ''}
    </table>
    <div class="foot">${esc(workspace || brandName)} · This statement was generated by RentLoja.</div>
    <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 200); };</script>
  </body></html>`

  const w = window.open('', '_blank')
  if (!w) throw new Error('Please allow pop-ups to open the statement.')
  w.document.write(html)
  w.document.close()
}

function slug(s) { return String(s || 'tenant').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
