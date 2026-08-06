import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { db } from '../../lib/db.js'
import { money, fmtDate } from '../../lib/format.js'
import { StatCard, Spinner } from '../../components/ui.jsx'
import { Input } from '../../components/Field.jsx'
import { IconWallet, IconChart, IconClock, IconPlus, IconTrash, IconCheckCircle } from '../../components/icons.jsx'

// App-owner cost & profit tracker. Revenue/manager/tenant figures are LIVE (from
// the platform overview). The bills you pay are stored in the DB so they sync
// across your devices; if the table isn't there yet (migration 0042 not run) or
// you're offline, it falls back to this device's storage.
const LOCAL_KEY = 'rentflow_platform_costs_v1'

const addMonths = (dateStr, n) => { const d = new Date(dateStr); d.setMonth(d.getMonth() + n); return iso(d) }
const addYears = (dateStr, n) => { const d = new Date(dateStr); d.setFullYear(d.getFullYear() + n); return iso(d) }
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysUntil = (dateStr) => Math.ceil((new Date(dateStr + 'T00:00:00') - new Date(iso(new Date()) + 'T00:00:00')) / 86400000)
const monthly = (c) => (c.cycle === 'yearly' ? Number(c.amount || 0) / 12 : Number(c.amount || 0))

function defaultCosts() {
  const today = iso(new Date())
  const m = () => addMonths(today, 1)
  const y = () => addYears(today, 1)
  return [
    { id: 'supabase', name: 'Supabase Pro (database)', amount: 25, cycle: 'monthly', nextDue: m() },
    { id: 'render', name: 'Render (API server)', amount: 7, cycle: 'monthly', nextDue: m() },
    { id: 'vercel', name: 'Vercel (website hosting)', amount: 20, cycle: 'monthly', nextDue: m() },
    { id: 'email', name: 'Email (Resend / Postmark)', amount: 10, cycle: 'monthly', nextDue: m() },
    { id: 'domain', name: 'Domain — rentloja.com', amount: 12, cycle: 'yearly', nextDue: y() },
  ]
}

export default function AdminCosts() {
  const { overview } = useOutletContext()
  const [costs, setCosts] = useState(null)
  const [assump, setAssump] = useState({ pesepay: 3, perTenant: 0.10 })
  const [synced, setSynced] = useState(null) // true = DB (all devices), false = this device only
  const timer = useRef(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await db.adminCosts()
        if (!alive) return
        setCosts(Array.isArray(r?.costs) && r.costs.length ? r.costs : defaultCosts())
        setAssump({ pesepay: r?.pesepay ?? 3, perTenant: r?.perTenant ?? 0.10 })
        setSynced(true)
      } catch {
        if (!alive) return
        try {
          const c = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null')
          setCosts(c?.costs?.length ? c.costs : defaultCosts())
          setAssump({ pesepay: c?.pesepay ?? 3, perTenant: c?.perTenant ?? 0.10 })
        } catch { setCosts(defaultCosts()) }
        setSynced(false)
      }
    })()
    return () => { alive = false }
  }, [])

  // Debounced persist: try the DB (syncs everywhere), fall back to this device.
  const persist = useCallback((nextCosts, nextAssump) => {
    const payload = { costs: nextCosts, pesepay: Number(nextAssump.pesepay) || 0, perTenant: Number(nextAssump.perTenant) || 0 }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try { await db.adminSaveCosts(payload); setSynced(true) }
      catch { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(payload)) } catch { /* ignore */ } setSynced(false) }
    }, 600)
  }, [])

  const save = (next) => { setCosts(next); persist(next, assump) }
  const saveAssump = (next) => { setAssump(next); persist(costs || [], next) }

  const patch = (id, k, v) => save(costs.map((c) => (c.id === id ? { ...c, [k]: v } : c)))
  const remove = (id) => save(costs.filter((c) => c.id !== id))
  const add = () => save([...(costs || []), { id: 'c' + Date.now(), name: 'New cost', amount: 0, cycle: 'monthly', nextDue: addMonths(iso(new Date()), 1) }])
  // "I've paid this" → roll the due date forward one billing cycle.
  const markPaid = (id) => save(costs.map((c) => (c.id === id
    ? { ...c, nextDue: c.cycle === 'yearly' ? addYears(c.nextDue, 1) : addMonths(c.nextDue, 1) }
    : c)))

  const upcoming = useMemo(() => (costs || []).filter((c) => c.nextDue).slice().sort((a, b) => new Date(a.nextDue) - new Date(b.nextDue)), [costs])

  if (!overview || !costs) return <div className="center" style={{ minHeight: 320 }}><Spinner /></div>

  const mrr = Number(overview.mrr || 0)
  const managers = Number(overview.activeSubs || 0)
  const tenants = Number(overview.users?.tenants || 0)

  const monthlyCost = costs.reduce((s, c) => s + monthly(c), 0)
  const pesepayFee = mrr * (Number(assump.pesepay || 0) / 100)
  const variable = tenants * Number(assump.perTenant || 0)
  const profit = mrr - pesepayFee - variable - monthlyCost
  const marginPct = mrr > 0 ? (profit / mrr) * 100 : 0
  const avgContribution = managers > 0 ? (mrr - pesepayFee - variable) / managers : 0
  const breakEven = avgContribution > 0 ? Math.ceil(monthlyCost / avgContribution) : null

  const next = upcoming[0]
  const nextDays = next ? daysUntil(next.nextDue) : null

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">Costs &amp; pricing</div>
        <h1>Running costs &amp; profit</h1>
        <p className="row gap wrap" style={{ alignItems: 'center' }}>
          <span>Your live revenue against what you pay to run RentLoja.</span>
          {synced === true && <span className="pill ok" style={{ fontSize: '.72rem' }}>Synced across devices</span>}
          {synced === false && <span className="pill neutral" style={{ fontSize: '.72rem' }} title="Run migration 0042 to sync across devices">Saved on this device</span>}
        </p>
      </div>

      <div className="grid stats" style={{ marginBottom: 20 }}>
        <StatCard label="Monthly revenue" value={money(mrr)} sub={`${managers} paying manager${managers === 1 ? '' : 's'} · MRR`} icon={<IconWallet size={18} />} />
        <StatCard label="Monthly costs" value={money(monthlyCost + pesepayFee + variable)} sub={`${money(monthlyCost)} bills + ${money(pesepayFee + variable)} usage`} icon={<IconChart size={18} />} />
        <StatCard label="Monthly profit" sub={profit >= 0 ? 'in the black' : 'in the red'} icon={<IconCheckCircle size={18} />}
          value={<span style={{ color: profit >= 0 ? 'var(--green)' : 'var(--danger)' }}>{money(profit)}</span>} />
        <StatCard label="Gross margin" value={`${Math.round(marginPct)}%`} sub={breakEven ? `break-even ≈ ${breakEven} managers` : 'after all costs'} icon={<IconChart size={18} />} />
      </div>

      {/* Next bill due */}
      <div className="card pad" style={{ marginBottom: 20, background: 'var(--gold-bg)', borderColor: 'var(--gold-line)' }}>
        <div className="row gap" style={{ alignItems: 'center' }}>
          <span style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--surface)', border: '1px solid var(--gold-line)', color: 'var(--gold)', flexShrink: 0 }}><IconClock size={20} /></span>
          <div>
            {next ? (
              <>
                <div style={{ fontWeight: 700 }}>
                  Next bill: {next.name} — {money(next.amount)}
                  {' '}<span style={{ color: nextDays <= 3 ? 'var(--danger)' : 'var(--text-dim)', fontWeight: 600 }}>
                    ({nextDays < 0 ? `${Math.abs(nextDays)} day${Math.abs(nextDays) === 1 ? '' : 's'} overdue` : nextDays === 0 ? 'due today' : `in ${nextDays} day${nextDays === 1 ? '' : 's'}`})
                  </span>
                </div>
                <div className="muted" style={{ fontSize: '0.86rem' }}>Due {fmtDate(next.nextDue)}. Set the real dates below after you subscribe to Supabase &amp; Render.</div>
              </>
            ) : <div style={{ fontWeight: 600 }}>Add your bills below to track when each one is due.</div>}
          </div>
        </div>
      </div>

      {/* Costs table */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="spread" style={{ padding: '16px 18px 12px' }}>
          <h3>Your monthly bills</h3>
          <button className="btn sm ghost" onClick={add}><IconPlus size={14} /> Add cost</button>
        </div>
        <div className="divider" style={{ margin: 0 }} />
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Service</th><th>Amount</th><th>Billing</th><th>Next payment</th><th style={{ textAlign: 'right' }}>Per month</th><th></th></tr></thead>
            <tbody>
              {costs.map((c) => {
                const d = c.nextDue ? daysUntil(c.nextDue) : null
                return (
                  <tr key={c.id}>
                    <td><input className="input" value={c.name} onChange={(e) => patch(c.id, 'name', e.target.value)} style={{ minWidth: 160 }} /></td>
                    <td><input className="input" type="number" min="0" step="1" value={c.amount} onChange={(e) => patch(c.id, 'amount', e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()} style={{ width: 90 }} /></td>
                    <td>
                      <select className="select" value={c.cycle} onChange={(e) => patch(c.id, 'cycle', e.target.value)} style={{ width: 110 }}>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </td>
                    <td>
                      <input className="input" type="date" value={c.nextDue || ''} onChange={(e) => patch(c.id, 'nextDue', e.target.value)} style={{ width: 150 }} />
                      {d != null && <div className="muted" style={{ fontSize: '0.72rem', marginTop: 2, color: d <= 3 ? 'var(--danger)' : undefined }}>
                        {d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? 'due today' : `in ${d}d`}</div>}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>{money(monthly(c))}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn sm ghost" title="Mark paid → roll to next cycle" onClick={() => markPaid(c.id)}><IconCheckCircle size={14} /></button>
                      <button className="btn sm ghost danger" title="Remove" onClick={() => remove(c.id)}><IconTrash size={14} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--line)' }}>
                <td style={{ fontWeight: 700 }}>Total fixed</td><td></td><td></td><td></td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{money(monthlyCost)}<span className="muted" style={{ fontWeight: 400 }}>/mo</span></td><td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Assumptions + profit breakdown */}
      <div className="card pad">
        <h3 style={{ marginBottom: 12 }}>Usage costs &amp; profit</h3>
        <div className="row gap wrap" style={{ marginBottom: 16 }}>
          <div style={{ maxWidth: 220 }}>
            <Input label="Pesepay fee on subscriptions (%)" type="number" min="0" step="0.1" value={assump.pesepay}
              onChange={(e) => saveAssump({ ...assump, pesepay: e.target.value })} onWheel={(e) => e.currentTarget.blur()} />
          </div>
          <div style={{ maxWidth: 240 }}>
            <Input label="Cost per active tenant / mo ($)" type="number" min="0" step="0.01" value={assump.perTenant}
              onChange={(e) => saveAssump({ ...assump, perTenant: e.target.value })} onWheel={(e) => e.currentTarget.blur()}
              hint="Mostly AI usage." />
          </div>
        </div>
        <div className="fee-box">
          <div className="spread"><span className="muted">Revenue (MRR)</span><span className="mono" style={{ color: 'var(--green)' }}>{money(mrr)}</span></div>
          <div className="spread"><span className="muted">Pesepay fees ({assump.pesepay}%)</span><span className="mono" style={{ color: 'var(--danger)' }}>−{money(pesepayFee)}</span></div>
          <div className="spread"><span className="muted">Per-tenant costs ({tenants} × {money(Number(assump.perTenant || 0))})</span><span className="mono" style={{ color: 'var(--danger)' }}>−{money(variable)}</span></div>
          <div className="spread"><span className="muted">Fixed bills</span><span className="mono" style={{ color: 'var(--danger)' }}>−{money(monthlyCost)}</span></div>
          <div className="spread fee-total"><b>Monthly profit</b><b className="mono" style={{ color: profit >= 0 ? 'var(--green)' : 'var(--danger)' }}>{money(profit)}</b></div>
        </div>
        <p className="hint" style={{ marginTop: 10 }}>Revenue, managers ({managers}) and tenants ({tenants}) are live from your platform.</p>
      </div>
    </>
  )
}
