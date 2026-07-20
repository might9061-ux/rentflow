import { useEffect, useState } from 'react'
import { db } from '../../lib/db.js'
import { money, fmtDate } from '../../lib/format.js'
import { Spinner, EmptyState } from '../../components/ui.jsx'

// Trail of privileged actions taken from this console. Read-only by design —
// the table has no write policy, so history can't be edited from the app.
const LABELS = {
  'plan.activate': { text: 'Plan activated', cls: 'ok' },
  'plan.deactivate': { text: 'Plan switched off', cls: 'rejected' },
  'payment.record': { text: 'Payment recorded', cls: 'neutral' },
}

function Detail({ action, details }) {
  if (!details) return <span className="muted">—</span>
  if (action === 'payment.record') {
    return <span>{money(details.amount)} · {details.method}{details.reference ? ` · ${details.reference}` : ''}</span>
  }
  const { from = {}, to = {} } = details
  const bits = []
  if (from.active !== to.active) bits.push(`${from.active ? 'active' : 'inactive'} → ${to.active ? 'active' : 'inactive'}`)
  if (from.capacity !== to.capacity) bits.push(`capacity ${from.capacity ?? '—'} → ${to.capacity ?? '—'}`)
  if (from.price !== to.price) bits.push(`${money(from.price || 0)} → ${money(to.price || 0)}`)
  return <span>{bits.length ? bits.join(' · ') : 'no change'}</span>
}

export default function AdminAudit() {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => { (async () => {
    try { setRows(await db.adminAudit()) } catch (e) { setErr(e.message); setRows([]) }
  })() }, [])

  if (!rows && !err) return <div className="center" style={{ minHeight: 320 }}><Spinner /></div>

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">Security</div>
        <h1>Admin activity</h1>
        <p>Every plan change and recorded payment made from this console. This log can’t be edited.</p>
      </div>

      {err && (
        <div className="banner" style={{ marginBottom: 16 }}>
          <span>Couldn’t load the log: {err}. If this is new, migration 0020 may not have been run yet.</span>
        </div>
      )}

      {rows?.length === 0 && !err ? (
        <EmptyState icon="🗒️" title="Nothing yet">Actions you take here will be recorded.</EmptyState>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>When</th><th>Action</th><th>Workspace</th><th>Details</th><th>By</th></tr>
              </thead>
              <tbody>
                {(rows || []).map((r) => {
                  const l = LABELS[r.action] || { text: r.action, cls: 'neutral' }
                  return (
                    <tr key={r.id}>
                      <td className="nowrap muted">{fmtDate(r.created_at)}</td>
                      <td><span className={`pill ${l.cls}`}>{l.text}</span></td>
                      <td style={{ fontWeight: 600 }}>{r.target_email || '—'}</td>
                      <td className="muted"><Detail action={r.action} details={r.details} /></td>
                      <td className="muted nowrap">{r.actor_email || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
