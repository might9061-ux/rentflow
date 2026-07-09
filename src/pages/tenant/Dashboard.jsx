import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { db } from '../../lib/db.js'
import { money, fmtDate } from '../../lib/format.js'
import { currentPeriod, formatPeriod } from '../../lib/billing.js'
import { buildLedger } from '../../lib/ledger.js'
import { StatCard, StatusPill, PeriodTag, Spinner, EmptyState } from '../../components/ui.jsx'
import { DonutChart } from '../../components/Charts.jsx'
import { collectionBreakdown } from '../../lib/arrears.js'
import { IconWallet, IconReceipt, IconSparkle, IconArrowRight, IconHome, IconBuilding, IconClock } from '../../components/icons.jsx'

const FRAMES = [{ label: '3M', v: 3 }, { label: '6M', v: 6 }, { label: '12M', v: 12 }, { label: 'All', v: 'all' }]

// Paid vs not-yet-paid for a chosen window — one consistent per-month coverage
// model (see arrears.js) so widening the window never flips months paid↔unpaid.
function paidStats(payments, profile, frame) {
  const { collected, notPaid } = collectionBreakdown(profile, payments, frame)
  return { paid: collected, due: notPaid }
}

export default function TenantDashboard() {
  const { userId, profile } = useAuth()
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [payments, setPayments] = useState([])
  const [manager, setManager] = useState(null)
  const [tenant, setTenant] = useState(null)
  const [frame, setFrame] = useState(6)

  useEffect(() => {
    (async () => {
      // Pull a FRESH tenant record too, so the balance reflects payments the
      // manager just approved (the cached auth profile can be stale).
      const [pays, mgr, me] = await Promise.all([
        db.listTenantPayments(userId), db.getTenantManager(userId), db.getTenant(userId),
      ])
      setPayments(pays); setManager(mgr); setTenant(me); setLoading(false)
    })()
  }, [userId])

  if (loading || !profile) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>

  const t = tenant || profile
  const rent = Number(t.rent || 0)
  const period = currentPeriod(t.due_day)
  const recent = payments.slice(0, 4)

  // One shared ledger drives credit, status, amount owed and the next due date —
  // so the dashboard and the payment history can never disagree.
  const led = buildLedger({ payments, rent, dueDay: t.due_day, startDate: t.lease_start || t.created_at })
  const credit = led.creditAdvance     // money paid ahead (beyond this month)
  const owed = led.owedThisMonth       // still owed for the current month
  const monthsCovered = led.monthsAhead
  const nextDue = led.nextDue.from     // date the next payment is due
  const creditNote = monthsCovered >= 1
    ? `Covers ${monthsCovered} month${monthsCovered > 1 ? 's' : ''} ahead`
    : 'Applied to your next rent'
  // Totals from the actual approved payments (not the stored figure).
  const approvedPays = payments.filter((p) => p.status === 'approved')
  const totalPaid = approvedPays.reduce((s, p) => s + Number(p.amount), 0)
  const ps = paidStats(payments, t, frame)

  // Payments the tenant has submitted that are still waiting for the manager.
  const pendingPays = payments.filter((p) => p.status === 'pending')
  const pendingTotal = pendingPays.reduce((s, p) => s + Number(p.amount), 0)

  const downloadLease = () => {
    if (!profile.lease_doc) return
    const a = document.createElement('a')
    a.href = profile.lease_doc
    a.download = profile.lease_doc_name || 'lease-agreement'
    document.body.appendChild(a); a.click(); a.remove()
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="eyebrow">Your tenancy</div>
        <h1>Hello, {profile.first_name}</h1>
        <p className="row gap"><IconHome size={15} /> Billing period <PeriodTag period={period} /></p>
      </div>

      {/* This month's balance / next payment */}
      <div className="card pad" style={{ marginBottom: 20 }}>
        {owed > 0 ? (
          <div className="spread wrap" style={{ gap: 14, alignItems: 'center' }}>
            <div>
              <div className="eyebrow">Balance this month</div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: '2.1rem', fontWeight: 700, lineHeight: 1.1 }}>
                {money(owed)} <span className="muted" style={{ fontSize: '1rem', fontWeight: 400, fontFamily: 'var(--sans)' }}>left to pay</span>
              </div>
              <p className="muted" style={{ fontSize: '0.86rem', marginTop: 4 }}>
                Rent {money(rent)}{credit > 0 ? ` · ${money(credit)} credit applied` : ''} · due by {fmtDate(period.to)}
              </p>
            </div>
            <Link to="/tenant/pay" className="btn primary">Pay {money(owed)} <IconArrowRight size={14} /></Link>
          </div>
        ) : (
          <div>
            <div className="eyebrow" style={{ color: 'var(--green)' }}>You're all paid up 🎉</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '2.1rem', fontWeight: 700, lineHeight: 1.1 }}>
              {money(0)} <span className="muted" style={{ fontSize: '1rem', fontWeight: 400, fontFamily: 'var(--sans)' }}>due right now</span>
            </div>
            <p className="muted" style={{ fontSize: '0.9rem', marginTop: 6 }}>
              Next payment: <b style={{ color: 'var(--text)' }}>{money(rent)}</b> due <b style={{ color: 'var(--text)' }}>{fmtDate(nextDue)}</b>
              {monthsCovered > 0 && ` — your credit already covers the next ${monthsCovered} month${monthsCovered > 1 ? 's' : ''}`}.
            </p>
          </div>
        )}
      </div>

      {pendingPays.length > 0 && (
        <div className="banner gold" style={{ marginBottom: 20 }}>
          <div className="b-ico"><IconClock size={20} /></div>
          <div className="grow">
            <div style={{ fontWeight: 600 }}>
              {pendingPays.length} payment{pendingPays.length > 1 ? 's' : ''} awaiting approval — {money(pendingTotal)}
            </div>
            <div className="muted" style={{ fontSize: '0.86rem' }}>
              Your manager needs to approve {pendingPays.length > 1 ? 'them' : 'it'} before it counts. This updates automatically once approved.
            </div>
          </div>
        </div>
      )}

      {credit > 0 && (
        <div className="banner">
          <div className="b-ico"><IconSparkle size={20} /></div>
          <div className="grow">
            <div style={{ fontWeight: 600 }}>Credit balance: <span className="mono" style={{ color: 'var(--green)' }}>{money(credit)}</span></div>
            <div className="muted" style={{ fontSize: '0.86rem' }}>{creditNote} — automatically applied to your next rent.</div>
          </div>
        </div>
      )}

      <div className="grid stats" style={{ marginBottom: 28 }}>
        <StatCard label="Monthly rent" value={money(rent)} sub={`Due day ${t.due_day}`} icon={<IconWallet size={18} />} onClick={() => nav('/tenant/pay')} />
        <StatCard label="Current status" value={<StatusPill status={led.currentStatus} />} sub={formatPeriod(period)} onClick={() => nav('/tenant/history')} />
        <StatCard label="Total paid (all time)" value={money(totalPaid)} sub={`${approvedPays.length} receipts`} icon={<IconReceipt size={18} />} onClick={() => nav('/tenant/history')} />
      </div>

      {/* Paid vs not-yet-paid */}
      <div className="card pad" style={{ marginBottom: 20 }}>
        <div className="spread wrap" style={{ marginBottom: 16, gap: 12 }}>
          <div>
            <h3>Paid vs due</h3>
            <p className="muted" style={{ fontSize: '0.84rem' }}>{frame === 'all' ? 'All time' : `Last ${frame} months`}{owed > 0 ? ` · ${money(owed)} due now` : ' · up to date'}</p>
          </div>
          <div className="seg">
            {FRAMES.map((f) => (
              <button key={f.v} className={frame === f.v ? 'on' : ''} onClick={() => setFrame(f.v)}>{f.label}</button>
            ))}
          </div>
        </div>
        <DonutChart
          centerValue={money(ps.paid)} centerLabel="Paid"
          segments={[
            { label: 'Paid', value: ps.paid, color: 'var(--green)' },
            { label: 'Not yet paid', value: ps.due, color: '#e0b15f' },
          ]} />
      </div>

      {/* Lease */}
      <div className="card pad" style={{ marginBottom: 20 }}>
        <div className="spread wrap" style={{ gap: 12 }}>
          <div className="row gap">
            <span style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--green-bg)', border: '1px solid var(--green-line)', color: 'var(--green)' }}><IconBuilding size={18} /></span>
            <div>
              <h3 style={{ fontSize: '1.1rem' }}>Lease</h3>
              <div className="muted" style={{ fontSize: '0.84rem' }}>{fmtDate(profile.lease_start)} → {profile.lease_end ? fmtDate(profile.lease_end) : '—'}</div>
            </div>
          </div>
          {profile.lease_doc
            ? <button className="btn ghost sm" onClick={downloadLease}><IconReceipt size={14} /> Download lease</button>
            : <span className="muted" style={{ fontSize: '0.8rem' }}>No document on file yet</span>}
        </div>
      </div>

      <div className="card pad" style={{ marginBottom: 20 }}>
        <div className="spread" style={{ marginBottom: 4 }}>
          <h3>Ready to pay?</h3>
          <Link to="/tenant/pay" className="btn primary sm">Submit a payment <IconArrowRight size={14} /></Link>
        </div>
        <p className="muted">Choose your method (EcoCash, InnBucks, Cash USD, Bank Transfer, Mukuru), add your reference, and it goes to {manager?.first_name || 'your manager'} for approval.</p>
      </div>

      <div className="spread" style={{ marginBottom: 12 }}>
        <h3>Recent activity</h3>
        <Link to="/tenant/history" className="btn ghost sm">Full history <IconArrowRight size={14} /></Link>
      </div>
      {recent.length === 0 ? (
        <div className="card"><EmptyState icon="🧾" title="No payments yet">Submit your first payment to get started.</EmptyState></div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Billing period</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead>
            <tbody>
              {recent.map((p) => (
                <tr key={p.id} className="clickable-row" onClick={() => nav('/tenant/history')}>
                  <td className="nowrap">{fmtDate(p.paid_date)}</td>
                  <td><PeriodTag from={p.period_from} to={p.period_to} /></td>
                  <td className="mono" style={{ fontWeight: 600 }}>{money(p.amount)}</td>
                  <td>{p.method}</td>
                  <td><StatusPill status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
