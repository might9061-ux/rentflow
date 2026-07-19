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
  useEffect(() => { (async () => setRows(await db.listSubscriptionPayments(workspace.id)))() }, [workspace.id])

  const price = priceForCapacity(Number(capacity) || 0)
  const tier = tierForCapacity(Number(capacity) || 0)

  // Managers can no longer activate themselves (migration 0019) — this is the
  // only way a plan goes live, after the landlord has paid out-of-band.
  const setPlan = async (active) => {
    setBusy(true)
    try {
      const updated = await db.adminSetPlan(ws.id, active
        ? { plan_active: true, plan_capacity: Number(capacity) || 0, plan_price: price }
        : { plan_active: false })
      setWs((w) => ({ ...w, ...updated }))
      toast.success(active ? 'Plan activated' : 'Plan switched off',
        active ? `${tier.name} · up to ${capacity} tenants · ${money(price)}/mo` : 'They can no longer add tenants.')
      onChanged?.()
    } catch (e) { toast.error('Could not update plan', e.message) }
    finally { setBusy(false) }
  }

  return (
    <Modal wide title={ws.name} onClose={onClose} footer={<button className="btn ghost" onClick={onClose}>Close</button>}>
      <div className="row gap wrap" style={{ marginBottom: 14 }}>
        <span className="pill neutral"><IconBuilding size={12} /> {tierForCapacity(ws.plan_capacity).name} · ≤{ws.plan_capacity}</span>
        {ws.plan_active ? <span className="pill ok"><span className="dot" /> Active</span> : <span className="pill rejected">Inactive</span>}
        <span className="muted" style={{ fontSize: '0.82rem' }}>{ws.email} · joined {fmtDate(ws.joined_at)}</span>
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

        <div className="spread wrap" style={{ gap: 12, marginTop: 6 }}>
          <div className="muted" style={{ fontSize: '0.86rem' }}>
            {tier.name} tier → <b style={{ color: 'var(--gold)' }}>{money(price)}/mo</b>
            {Number(capacity) < (ws.tenants || 0) && (
              <span style={{ color: 'var(--red, #d9534f)', display: 'block', marginTop: 4 }}>
                ⚠ Below their current {ws.tenants} tenants — they won’t be able to add more.
              </span>
            )}
          </div>
          <button className="btn primary" disabled={busy || !capacity} onClick={() => setPlan(true)}>
            <IconCheck size={15} /> {ws.plan_active ? 'Update plan' : 'Activate plan'}
          </button>
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
