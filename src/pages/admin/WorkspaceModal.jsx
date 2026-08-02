import { useEffect, useState } from 'react'
import { db } from '../../lib/db.js'
import { useToast } from '../../context/ToastContext.jsx'
import { money, fmtDate } from '../../lib/format.js'
import { tierForCapacity, priceForCapacity, PLAN_TIERS } from '../../lib/pricing.js'
import { StatCard, Spinner, EmptyState } from '../../components/ui.jsx'
import Modal from '../../components/Modal.jsx'
import { Input } from '../../components/Field.jsx'
import { IconBuilding, IconCheck, IconX } from '../../components/icons.jsx'

// Drill-down for a single workspace — its subscription history, fee summary,
// and the controls that switch its plan on or off.
export default function WorkspaceModal({ workspace, onClose, onChanged }) {
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [ws, setWs] = useState(workspace)
  const [busy, setBusy] = useState(false)
  const [capacity, setCapacity] = useState(String(workspace.plan_capacity || 5))
  const [logPayment, setLogPayment] = useState(true)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('EcoCash')
  const [reference, setReference] = useState('')
  const reload = async () => setRows(await db.adminWorkspacePayments(workspace.id))
  useEffect(() => { reload() }, [workspace.id])

  const deactivated = ws.account_status === 'suspended'
  // App-owner only: deactivate / reactivate the whole workspace. Reversible and
  // loses no data — it just blocks their sign-in until reactivated.
  const toggleAccount = async (active) => {
    if (!active && !window.confirm(`Deactivate ${ws.name}?\n\nThey won't be able to sign in until you reactivate them. All their data (tenants, payments, properties) is kept.`)) return
    setBusy(true)
    try {
      const updated = await db.adminSetWorkspaceStatus(ws.id, active)
      setWs((w) => ({ ...w, account_status: updated.account_status }))
      toast.success(active ? 'Account reactivated' : 'Account deactivated',
        active ? 'They can sign in again.' : 'They can no longer sign in. No data was lost.')
      onChanged?.()
    } catch (e) { toast.error('Could not update', e.message) } finally { setBusy(false) }
  }

  const price = priceForCapacity(Number(capacity) || 0)
  const tier = tierForCapacity(Number(capacity) || 0)
  const paidTotal = (rows || []).reduce((s, r) => s + Number(r.amount || 0), 0)

  const recordPayment = async (amt) => {
    await db.adminRecordPayment(ws.id, { amount: amt, method, reference: reference || null })
    setReference('')
    await reload()
  }

  // Managers can no longer activate themselves (migration 0019) — this is the
  // only way a plan goes live, after the landlord has paid out-of-band.
  const setPlan = async (active) => {
    setBusy(true)
    try {
      const updated = await db.adminSetPlan(ws.id, active
        ? { plan_active: true, plan_capacity: Number(capacity) || 0, plan_price: price }
        : { plan_active: false })
      setWs((w) => ({ ...w, ...updated }))

      // Granting access and recording the money are separate facts — without
      // the second, "Subs paid" and the revenue totals stay at zero.
      let paid = 0
      if (active && logPayment) {
        paid = Number(amount) > 0 ? Number(amount) : price
        try { await recordPayment(paid) } catch (e) { toast.error('Plan activated, but the payment was not recorded', e.message) }
      }
      toast.success(active ? 'Plan activated' : 'Plan switched off',
        active
          ? `${tier.name} · up to ${capacity} tenants · ${money(price)}/mo${paid ? ` · ${money(paid)} recorded` : ''}`
          : 'They can no longer add tenants.')
      onChanged?.()
    } catch (e) { toast.error('Could not update plan', e.message) }
    finally { setBusy(false) }
  }

  // Monthly renewal on an already-active plan — money in, no plan change.
  const justRecord = async () => {
    const amt = Number(amount) > 0 ? Number(amount) : Number(ws.plan_price) || price
    setBusy(true)
    try {
      await recordPayment(amt)
      toast.success('Payment recorded', `${money(amt)} from ${ws.name}.`)
      onChanged?.()
    } catch (e) { toast.error('Could not record payment', e.message) }
    finally { setBusy(false) }
  }

  return (
    <Modal wide title={ws.name} onClose={onClose} footer={<button className="btn ghost" onClick={onClose}>Close</button>}>
      <div className="row gap wrap" style={{ marginBottom: 14 }}>
        <span className="pill neutral"><IconBuilding size={12} /> {tierForCapacity(ws.plan_capacity).name} · ≤{ws.plan_capacity}</span>
        {ws.plan_active ? <span className="pill ok"><span className="dot" /> Active</span> : <span className="pill rejected">Inactive</span>}
        {deactivated && <span className="pill rejected"><span className="dot" /> Account deactivated</span>}
        <span className="muted" style={{ fontSize: '0.82rem' }}>{ws.email} · joined {fmtDate(ws.joined_at)}</span>
      </div>

      {/* Account access — deactivate for non-payment (reversible, keeps all data). */}
      <div className="card pad spread wrap" style={{ marginBottom: 16, gap: 10, alignItems: 'center', borderColor: deactivated ? 'var(--danger)' : 'var(--line)' }}>
        <div>
          <div style={{ fontWeight: 600 }}>Account access</div>
          <div className="muted" style={{ fontSize: '0.82rem', marginTop: 2 }}>
            {deactivated
              ? 'Deactivated — they can’t sign in. Their data is safe and restored on reactivation.'
              : 'Active — deactivate to block sign-in (e.g. non-payment). No data is lost.'}
          </div>
        </div>
        {deactivated
          ? <button className="btn ok" disabled={busy} onClick={() => toggleAccount(true)}><IconCheck size={15} /> Reactivate account</button>
          : <button className="btn ghost danger" disabled={busy} onClick={() => toggleAccount(false)}><IconX size={15} /> Deactivate account</button>}
      </div>

      {/* Plan controls */}
      <div className="card pad" style={{ marginBottom: 16 }}>
        <div className="spread wrap" style={{ gap: 12, marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>Subscription</h3>
            <p className="muted" style={{ fontSize: '0.82rem', margin: '4px 0 0' }}>
              Switch on once they’ve paid you. They currently have <b>{ws.tenants}</b> tenant{ws.tenants === 1 ? '' : 's'}.
            </p>
          </div>
          {ws.plan_active
            ? <button className="btn ghost sm danger" disabled={busy} onClick={() => setPlan(false)}><IconX size={14} /> Switch off</button>
            : null}
        </div>

        <div className="row gap wrap" style={{ alignItems: 'flex-end' }}>
          <div style={{ minWidth: 150 }}>
            <Input label="Tenant capacity" inputMode="numeric" value={capacity}
              onChange={(e) => setCapacity(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div className="row gap wrap" style={{ gap: 6, paddingBottom: 14 }}>
            {PLAN_TIERS.filter((t) => Number.isFinite(t.upTo)).map((t) => (
              <button key={t.name} type="button" className="btn ghost sm"
                onClick={() => setCapacity(String(t.upTo))}>{t.name}</button>
            ))}
          </div>
        </div>

        <div className="muted" style={{ fontSize: '0.86rem', marginTop: 8 }}>
          {tier.name} tier → <b style={{ color: 'var(--gold)' }}>{money(price)}/mo</b>
          {Number(capacity) < (ws.tenants || 0) && (
            <span style={{ color: 'var(--red, #d9534f)', display: 'block', marginTop: 4 }}>
              ⚠ Below their current {ws.tenants} tenants — they won’t be able to add more.
            </span>
          )}
        </div>

        <div className="divider" />

        {/* Money received. Separate from access: activating grants the plan,
            this is what actually shows up in "Subs paid" and revenue. */}
        <label className="row gap" style={{ fontSize: '0.88rem', marginBottom: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={logPayment} onChange={(e) => setLogPayment(e.target.checked)} />
          <span>Record a payment (leave on if they’ve just paid you)</span>
        </label>

        {logPayment && (
          <div className="row gap wrap" style={{ alignItems: 'flex-end' }}>
            <div style={{ minWidth: 120 }}>
              <Input label="Amount" inputMode="decimal" placeholder={String(price)} value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} hint={`Default ${money(price)}`} />
            </div>
            <div style={{ minWidth: 130 }}>
              <label style={{ fontSize: '0.82rem', color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>Method</label>
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                {['EcoCash', 'Bank Transfer', 'Cash USD', 'InnBucks', 'Mukuru', 'Other'].map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ minWidth: 140, flex: 1 }}>
              <Input label="Reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. MP250718.1234" />
            </div>
          </div>
        )}

        <div className="spread wrap" style={{ gap: 10, marginTop: 14 }}>
          <span className="muted" style={{ fontSize: '0.82rem' }}>Recorded to date: <b className="mono">{money(paidTotal)}</b></span>
          <div className="row gap wrap">
            {ws.plan_active && logPayment && (
              <button className="btn ghost" disabled={busy} onClick={justRecord}>Record payment only</button>
            )}
            <button className="btn primary" disabled={busy || !capacity} onClick={() => setPlan(true)}>
              <IconCheck size={15} /> {ws.plan_active ? 'Update plan' : 'Activate plan'}
            </button>
          </div>
        </div>
      </div>
      <div className="grid stats" style={{ marginBottom: 16 }}>
        <StatCard label="Subscriptions paid" value={money(workspace.total_paid)} sub={`${workspace.payments} payments`} />
        <StatCard label="Rent processed" value={money(workspace.rent_volume || 0)} sub="Tenant payments" />
        <StatCard label="Transaction fees" value={money(workspace.fees || 0)} sub="0.5% to platform" />
      </div>
      {!rows ? <div className="center" style={{ minHeight: 80 }}><Spinner /></div>
        : rows.length === 0 ? <EmptyState icon="🧾" title="No payments yet" /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Date</th><th>For</th><th>Method</th><th>Reference</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="nowrap">{fmtDate(p.created_at)}</td>
                    <td className="muted">{p.period}</td>
                    <td>{p.method}</td>
                    <td className="mono muted">{p.reference}</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Modal>
  )
}
