// Build a CSV string from rows + column definitions, and trigger a download.
//   columns: [{ header, value: (row) => any }]

function escape(v) {
  if (v == null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCSV(rows, columns) {
  const head = columns.map((c) => escape(c.header)).join(',')
  const body = rows.map((r) => columns.map((c) => escape(c.value(r))).join(',')).join('\n')
  return head + '\n' + body
}

export function downloadCSV(filename, rows, columns) {
  const csv = toCSV(rows, columns)
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }) // BOM for Excel
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
