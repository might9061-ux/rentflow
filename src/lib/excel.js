// Export rows to a Microsoft Excel-readable file (.xls) — no dependencies.
// Excel opens an HTML table saved with the .xls extension + Office namespaces.
//   columns: [{ header, value: (row) => any, numeric?: bool }]

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function toExcelHtml(rows, columns, { sheet = 'Sheet1', title } = {}) {
  const head = columns.map((c) =>
    `<th style="background:#14110b;color:#d4af6a;text-align:left;border:1px solid #ccc;padding:5px 9px">${esc(c.header)}</th>`).join('')
  const body = rows.map((r) => '<tr>' + columns.map((c) => {
    const v = c.value(r)
    const fmt = c.numeric ? "mso-number-format:'#,##0.00';" : "mso-number-format:'\\@';" // text by default
    return `<td style="border:1px solid #ddd;padding:4px 9px;${fmt}">${esc(v)}</td>`
  }).join('') + '</tr>').join('')

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>${esc(sheet).slice(0, 31)}</x:Name>
<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
</head>
<body>${title ? `<h3>${esc(title)}</h3>` : ''}<table border="1" cellspacing="0">
<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`
}

export function downloadExcel(filename, rows, columns, opts = {}) {
  const html = toExcelHtml(rows, columns, opts)
  const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = /\.xls$/i.test(filename) ? filename : `${filename}.xls`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
