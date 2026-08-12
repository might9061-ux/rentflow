// Renders a generated lease agreement to printable HTML (for print / save-as-PDF
// and the on-screen preview). Uploaded leases use their own file instead.
import { money, fmtDate, fullName } from './format.js'

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

// Human summary of the term.
export function leaseTermLabel(lease) {
  const parts = []
  if (lease.start_date) parts.push(`from ${fmtDate(lease.start_date)}`)
  if (lease.end_date) parts.push(`to ${fmtDate(lease.end_date)}`)
  if (lease.term_months) parts.push(`(${lease.term_months} month${lease.term_months > 1 ? 's' : ''})`)
  return parts.join(' ') || '—'
}

// Full standalone HTML for printing / PDF.
export function leaseHtml({ lease, tenant, manager, property }) {
  const brandName = manager?.brand_name || manager?.company || 'RentLoja'
  const cur = lease.currency || 'USD'
  const landlord = manager?.company || fullName(manager) || brandName
  const propLine = property ? `${property.name}${tenant?.unit ? `, Unit ${tenant.unit}` : ''}${property.address ? `, ${property.address}` : ''}` : (tenant?.unit || '—')
  const money2 = (v) => (v == null || v === '' ? '—' : money(Number(v)))

  const clause = (n, title, body) => `<div class="cl"><b>${n}. ${esc(title)}.</b> ${body}</div>`

  const tenantSig = lease.status === 'signed'
    ? `<div class="sigval">${esc(lease.signed_name)}</div><div class="sigcap">Tenant — signed electronically ${fmtDate(lease.signed_at)}</div>`
    : `<div class="sigline"></div><div class="sigcap">Tenant signature &amp; date</div>`
  const landlordSig = lease.manager_signed_name
    ? `<div class="sigval">${esc(lease.manager_signed_name)}</div><div class="sigcap">Landlord — signed electronically ${fmtDate(lease.manager_signed_at)}</div>`
    : `<div class="sigline"></div><div class="sigcap">Landlord — ${esc(landlord)}</div>`

  // CUSTOM lease: the manager's own wording (placeholders already filled) IS the
  // agreement — render it verbatim with just the signature blocks appended.
  const customBody = lease.kind === 'custom'
    ? `<div class="cl" style="white-space:pre-wrap; text-align:left;">${esc(lease.terms || '')}</div>`
    : null

  return `<!doctype html><html><head><meta charset="utf-8"><title>Lease Agreement — ${esc(fullName(tenant))}</title>
  <style>
    @page { size: A4; margin: 22mm 18mm; }
    body { font-family: Georgia, 'Times New Roman', serif; color: #1a1714; line-height: 1.5; max-width: 720px; margin: 0 auto; padding: 24px; }
    h1 { text-align: center; font-size: 1.5rem; margin: 0 0 2px; }
    .sub { text-align: center; color: #6b6258; font-size: .85rem; margin-bottom: 20px; }
    .meta { width: 100%; border-collapse: collapse; margin: 14px 0 20px; font-size: .92rem; }
    .meta td { padding: 5px 0; vertical-align: top; }
    .meta td:first-child { color: #6b6258; width: 38%; }
    .cl { margin: 10px 0; font-size: .92rem; text-align: justify; }
    h3 { font-size: 1rem; margin: 22px 0 8px; }
    .sigs { display: flex; gap: 40px; margin-top: 40px; }
    .sig { flex: 1; }
    .sigline { border-bottom: 1px solid #1a1714; height: 34px; }
    .sigval { font-family: 'Segoe Script', 'Brush Script MT', cursive; font-size: 1.4rem; border-bottom: 1px solid #1a1714; padding-bottom: 2px; }
    .sigcap { color: #6b6258; font-size: .78rem; margin-top: 4px; }
    .foot { margin-top: 30px; color: #6b6258; font-size: .72rem; text-align: center; }
  </style></head><body>
  ${customBody ?? `<h1>Residential Lease Agreement</h1>
  <div class="sub">${esc(brandName)}</div>

  <table class="meta">
    <tr><td>Landlord</td><td><b>${esc(landlord)}</b></td></tr>
    <tr><td>Tenant</td><td><b>${esc(fullName(tenant))}</b>${tenant?.email ? ` · ${esc(tenant.email)}` : ''}${tenant?.phone ? ` · ${esc(tenant.phone)}` : ''}</td></tr>
    <tr><td>Property</td><td><b>${esc(propLine)}</b></td></tr>
    <tr><td>Term</td><td>${esc(leaseTermLabel(lease))}</td></tr>
    <tr><td>Monthly rent</td><td><b>${money2(lease.rent)} ${esc(cur)}</b>${lease.due_day ? `, due on day ${lease.due_day} of each month` : ''}</td></tr>
    <tr><td>Security deposit</td><td>${money2(lease.deposit)} ${esc(cur)}</td></tr>
  </table>

  ${clause(1, 'Parties &amp; Premises', `The Landlord lets and the Tenant hires the property described above (the &ldquo;Premises&rdquo;) for residential use only.`)}
  ${clause(2, 'Term', `This lease runs ${esc(leaseTermLabel(lease))}. Continued occupation after the end date is on a month-to-month basis unless renewed in writing.`)}
  ${clause(3, 'Rent', `The Tenant shall pay <b>${money2(lease.rent)} ${esc(cur)}</b> per month${lease.due_day ? `, on or before day ${lease.due_day} of each month` : ''}, to the Landlord through the RentLoja platform or as otherwise directed.`)}
  ${clause(4, 'Deposit', `The Tenant shall pay a security deposit of ${money2(lease.deposit)} ${esc(cur)}, refundable at the end of the tenancy less any amounts for unpaid rent or damage beyond fair wear and tear.`)}
  ${clause(5, 'Use &amp; Care', `The Tenant shall keep the Premises clean and in good condition, cause no nuisance, and not sublet without the Landlord&rsquo;s written consent.`)}
  ${clause(6, 'Maintenance', `The Tenant shall report faults promptly. The Landlord is responsible for structural repairs; the Tenant for damage they or their guests cause.`)}
  ${clause(7, 'Utilities', `Unless agreed otherwise in writing, the Tenant is responsible for utilities consumed at the Premises.`)}
  ${clause(8, 'Termination', `Either party may end this lease by giving one calendar month&rsquo;s written notice, subject to the term above and applicable law.`)}
  ${lease.terms?.trim() ? `<h3>Additional terms</h3><div class="cl">${esc(lease.terms).replace(/\n/g, '<br/>')}</div>` : ''}`}

  <div class="sigs">
    <div class="sig">${landlordSig}</div>
    <div class="sig">${tenantSig}</div>
  </div>

  <div class="foot">Generated by ${esc(brandName)} via RentLoja${lease.status === 'signed' ? ` · Signed ${fmtDate(lease.signed_at)}` : ''}</div>
  </body></html>`
}

// Open the lease in a new window and trigger the print dialog (save-as-PDF too).
export function printLease(args) {
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(leaseHtml(args))
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}

// Open the lease in a new window to REVIEW it (no print dialog) — used to preview
// before creating and to view an existing lease.
export function openLease(args) {
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(leaseHtml(args))
  w.document.close()
  w.focus()
}
