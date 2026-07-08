import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { money, fmtDate, monthYear } from '../../lib/format.js'
import {
  priceForCapacity, PLAN_PRESETS, PLAN_TIERS, tierForCapacity, MIN_CAPACITY, MAX_CAPACITY,
} from '../../lib/pricing.js'
import { Spinner, EmptyState } from '../../components/ui.jsx'
import { IconTag, IconCheck, IconUsers, IconWarn, IconWallet, IconReceipt } from '../../components/icons.jsx'
import PlanCheckout from './PlanCheckout.jsx'

function nextDue(from) {
  const d = new Date(from || Date.now())
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate()
  return new Date(d.getFullYear(), d.getMonth() + 1, Math.min(d.getDate(), lastDay))
}

export default function Plan() {
  const { userId, refresh } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [manager, setManager] = useState(null)
  const [tenantCount, setTenantCount] = useState(0)
  const [capacity, setCapacity] = useState(10)
  const [busy, setBusy] = useState(false)
  const [checkout, setCheckout] = useState(null) // { mode, capacity, price, tierName }
  const [subPays, setSubPays] = useState([])

  const load = async () => {
    const [m, tenants, pays] = await Promise.all([db.getManager(userId), db.listTenants(userId), db.listSubscriptionPayments(userId)])
    setManager(m)
    setTenantCount(tenants.length)
    setSubPays(pays)
    setCapacity(m?.plan_capacity || Math.max(10, Math.ceil((tenants.length || 1) / 5) * 5))
    setLoading(false)
  }
  useEffect(() => { load() }, [userId])

  if (loading) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>

  const price = priceForCapacity(capacity)
  const tier = tierForCapacity(capacity)
  const active = manager?.plan_active
  const onboarding = manager?.onboarded === false
  const tooSmall = capacity < tenantCount
  const cur = Number(manager?.plan_price || 0)

  // Has the manager already paid for THIS calendar month?
  const now = new Date()
  const paidThisMonth = subPays.some((p) => {
    const d = new Date(p.created_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const samePlan = active && capacity === manager.plan_capacity
  // Upgrading within a month you've already paid → only owe the difference.
  const isUpgrade = active && paidThisMonth && price > cur && !samePlan
  const isDowngrade = active && paidThisMonth && price < cur && !samePlan
  const upgradeDue = Math.max(0, price - cur)

  // Decide what to charge when the plan button is pressed.
  const changePlan = async () => {
    if (tooSmall) return toast.error('Capacity too small', `You already have ${tenantCount} tenants.`)
    if (samePlan) return toast.info('You’re already on this plan')
    if (isDowngrade) {
      // Cheaper plan — effective now, nothing to pay (you've already paid more this month).
      setBusy(true)
      try {
        await db.updateManagerSettings(userId, { plan_capacity: capacity, plan_price: price })
        await refresh()
        toast.success('Plan changed', `Switched to ${tier.name} · ${money(price)}/month. No charge — you’ve already paid this month.`)
        await load()
      } catch (e) { toast.error('Could not change', e.message) } finally { setBusy(false) }
      return
    }
    if (isUpgrade) {
      setCheckout({ mode: 'upgrade', capacity, price, charge: upgradeDue, credit: cur, tierName: tier.name })
      return
    }
    setCheckout({ mode: 'activate', capacity, price, charge: price, credit: 0, tierName: tier.name })
  }
  const payInstallment = () => setCheckout({
    mode: 'installment', capacity: manager.plan_capacity, price: manager.plan_price,
    tierName: tierForCapacity(manager.plan_capacity).name,
  })

  // Called by the checkout once the card has been charged.
  const handlePaid = async ({ card, reference }) => {
    if (checkout.mode === 'activate' || checkout.mode === 'upgrade') {
      await db.updateManagerSettings(userId, {
        plan_capacity: checkout.capacity, plan_price: checkout.price, plan_active: true,
        plan_started_at: manager?.plan_started_at || new Date().toISOString(),
        onboarded: true, billing_card: card,
      })
    } else {
      await db.updateManagerSettings(userId, { billing_card: card })
    }
    const paidAmount = checkout.charge ?? checkout.price
    const period = checkout.mode === 'upgrade'
      ? `Upgrade to ${checkout.tierName} · ${monthYear(new Date(), true)}`
      : monthYear(new Date(), true)
    await db.recordSubscriptionPayment(userId, {
      amount: paidAmount, period,
      method: `${card.brand} ····${card.last4}`, reference,
    })
    await refresh()
    toast.success('Payment successful', checkout.mode === 'upgrade'
      ? `${money(paidAmount)} paid to upgrade to ${checkout.tierName} (you were credited ${money(checkout.credit)} for your current plan).`
      : `${money(paidAmount)} paid for your ${checkout.tierName} plan.`)
    const wasOnboardingActivate = onboarding && checkout.mode === 'activate'
    setCheckout(null)
    if (wasOnboardingActivate) nav('/manager'); else load()
  }

  const continueFree = async () => {
    setBusy(true)
    try {
      await db.updateManagerSettings(userId, { onboarded: true })
      await refresh()
      toast.info('Exploring without a plan', 'Subscribe from Plan & billing when you’re ready to add tenants.')
      nav('/manager')
    } catch (err) { toast.error('Could not continue', err.message); setBusy(false) }
  }

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="page-head">
        <div className="eyebrow">{onboarding ? 'Welcome' : 'Subscription'}</div>
        <h1>{onboarding ? 'Choose your installment plan' : 'Plan & billing'}</h1>
        <p>Choose how many tenants you need. You’re billed monthly — the price steps up by tier.</p>
      </div>

      {onboarding && (
        <div className="banner gold" style={{ marginBottom: 18 }}>
          <div className="b-ico"><IconTag size={18} /></div>
          <div className="spread grow wrap" style={{ gap: 10 }}>
            <span>Your account is ready! See how RentFlow works for managers and tenants, then pick a monthly installment — an active plan is required to add tenants.</span>
            <div className="row gap">
              <button className="btn sm" onClick={() => nav('/manager/demo')}>View demo</button>
              <button className="btn ghost sm" onClick={continueFree} disabled={busy}>Explore first</button>
            </div>
          </div>
        </div>
      )}

      {/* Current plan */}
      <div className={`card pad ${active ? '' : ''}`} style={{ marginBottom: 18, borderColor: active ? 'var(--gold-line)' : 'var(--line-soft)', background: active ? 'var(--gold-bg)' : 'var(--surface)' }}>
        <div className="spread wrap" style={{ gap: 12 }}>
          <div className="row gap">
            <span style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--gold-bg)', border: '1px solid var(--gold-line)', color: 'var(--gold)' }}><IconTag size={20} /></span>
            <div>
              <div style={{ fontWeight: 600 }}>{active ? 'Active plan' : 'No active plan'}</div>
              <div className="muted" style={{ fontSize: '0.84rem' }}>
                {active
                  ? `${manager.plan_capacity} tenants · ${money(manager.plan_price)}/month · since ${fmtDate(manager.plan_started_at)}`
                  : 'Pick a capacity below to get started.'}
              </div>
            </div>
          </div>
          <span className="pill neutral"><IconUsers size={13} /> {tenantCount}{active ? ` / ${manager.plan_capacity}` : ''} tenants</span>
        </div>
        {active && tenantCount >= manager.plan_capacity && (
          <div className="row gap" style={{ marginTop: 12, color: 'var(--warn)', fontSize: '0.84rem' }}>
            <IconWarn size={15} /> You’ve reached your capacity — increase it below to add more tenants.
          </div>
        )}
      </div>

      {/* Capacity selector */}
      <div className="card pad" style={{ marginBottom: 18 }}>
        <div className="spread wrap" style={{ alignItems: 'flex-end', gap: 16 }}>
          <div className="grow" style={{ minWidth: 240 }}>
            <label className="row spread" style={{ fontSize: '0.84rem', color: 'var(--text-dim)', marginBottom: 8 }}>
              <span>Tenant capacity</span>
              <b style={{ color: 'var(--text)' }}>{capacity} tenants</b>
            </label>
            <input type="range" min={MIN_CAPACITY} max={MAX_CAPACITY} value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--gold)' }} />
            <div className="row spread" style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginTop: 4 }}>
              <span>{MIN_CAPACITY}</span><span>{MAX_CAPACITY}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="eyebrow" style={{ color: 'var(--gold)' }}>{tier.name}{Number.isFinite(tier.upTo) ? ` · up to ${tier.upTo}` : ' · 100+'}</div>
            <div className="mono" style={{ fontFamily: 'var(--serif)', fontSize: '2.6rem', fontWeight: 600, lineHeight: 1, color: 'var(--gold)' }}>{money(price)}</div>
            <div className="muted" style={{ fontSize: '0.8rem' }}>per month</div>
          </div>
        </div>

        {tooSmall && (
          <div className="row gap" style={{ marginTop: 14, color: 'var(--danger)', fontSize: '0.84rem' }}>
            <IconWarn size={15} /> You have {tenantCount} tenants — choose at least that many.
          </div>
        )}

        {isUpgrade && (
          <div className="banner gold" style={{ marginTop: 14 }}>
            <div className="b-ico"><IconTag size={18} /></div>
            <div style={{ fontSize: '0.86rem' }}>
              You’ve already paid {money(cur)} this month — upgrading to <b>{tier.name}</b> now costs only the
              difference: <b>{money(upgradeDue)}</b>. Next month you’re billed the full {money(price)}.
            </div>
          </div>
        )}

        <button className="btn primary block lg" style={{ marginTop: 16 }} disabled={tooSmall || busy || samePlan} onClick={changePlan}>
          {!active ? `Activate & pay ${money(price)}/month`
            : samePlan ? 'Your current plan'
            : isUpgrade ? `Upgrade now — pay ${money(upgradeDue)}`
            : isDowngrade ? `Switch to ${tier.name} (no charge now)`
            : `Update & pay ${money(price)}/month`}
        </button>
      </div>

      {/* Billing — payment method on file + installment history */}
      {active && (
        <div className="card pad" style={{ marginBottom: 18 }}>
          <div className="spread wrap" style={{ gap: 12, marginBottom: 14 }}>
            <div className="row gap">
              <span style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--gold)' }}><IconWallet size={18} /></span>
              <div>
                <h3 style={{ fontSize: '1.1rem' }}>Billing</h3>
                <div className="muted" style={{ fontSize: '0.82rem' }}>
                  {manager.billing_card
                    ? <>Card on file: <b className="mono" style={{ color: 'var(--text)' }}>{manager.billing_card.brand} ····{manager.billing_card.last4}</b> · exp {manager.billing_card.exp} · next due {fmtDate(nextDue(subPays[0]?.created_at || manager.plan_started_at))}</>
                    : 'No card on file yet.'}
                </div>
              </div>
            </div>
            <button className="btn primary sm" onClick={payInstallment}>Pay installment now</button>
          </div>
          {subPays.length === 0 ? (
            <EmptyState icon="🧾" title="No installments yet" />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Date</th><th>Period</th><th>Amount</th><th>Method</th><th>Reference</th></tr></thead>
                <tbody>
                  {subPays.map((p) => (
                    <tr key={p.id}>
                      <td className="nowrap">{fmtDate(p.created_at)}</td>
                      <td>{p.period}</td>
                      <td className="mono" style={{ fontWeight: 600 }}>{money(p.amount)}</td>
                      <td className="mono">{p.method}</td>
                      <td className="muted mono">{p.reference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Presets */}
      <h3 style={{ marginBottom: 12 }}>Popular sizes</h3>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        {PLAN_PRESETS.map((p) => {
          const on = capacity === p.capacity
          return (
            <button key={p.capacity} className="card pad" onClick={() => setCapacity(p.capacity)}
              style={{ textAlign: 'left', cursor: 'pointer', borderColor: on ? 'var(--gold)' : 'var(--line-soft)', background: on ? 'var(--gold-bg)' : 'var(--surface)' }}>
              <div className="spread">
                <span className="eyebrow" style={{ color: 'var(--gold)' }}>{p.name}</span>
                {on && <span style={{ color: 'var(--gold)' }}><IconCheck size={16} /></span>}
              </div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: '1.8rem', fontWeight: 600, marginTop: 6 }}>{money(p.price)}</div>
              <div className="muted" style={{ fontSize: '0.8rem' }}>per month</div>
              <div className="row gap muted" style={{ fontSize: '0.82rem', marginTop: 8 }}><IconUsers size={14} /> {p.capLabel} tenants</div>
            </button>
          )
        })}
      </div>

      <h3 style={{ margin: '22px 0 12px' }}>Pricing tiers</h3>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Tier</th><th>Tenants</th><th>Monthly</th></tr></thead>
          <tbody>
            {PLAN_TIERS.map((t, i) => {
              const from = i === 0 ? 1 : PLAN_TIERS[i - 1].upTo + 1
              const range = !Number.isFinite(t.upTo) ? `${PLAN_TIERS[i - 1].upTo}+` : from === t.upTo ? `up to ${t.upTo}` : `${from}–${t.upTo}`
              return (
                <tr key={t.name} style={tier.name === t.name ? { background: 'var(--gold-bg)' } : undefined}>
                  <td style={{ fontWeight: 600 }}>{t.name}</td>
                  <td>{range}</td>
                  <td className="mono" style={{ fontWeight: 600 }}>{money(t.price)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ marginTop: 12 }}>Billed monthly. This is a demo; no real charge is made.</p>

      {checkout && (
        <PlanCheckout {...checkout} manager={manager}
          onClose={() => setCheckout(null)} onPaid={handlePaid} />
      )}
    </div>
  )
}
