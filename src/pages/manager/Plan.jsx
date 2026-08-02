import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { money, fmtDate, monthYear } from '../../lib/format.js'
import {
  priceForCapacity, PLAN_PRESETS, PLAN_TIERS, tierForCapacity, MIN_CAPACITY, MAX_CAPACITY,
} from '../../lib/pricing.js'
import { installmentAmount, YEARLY_MONTHS } from '../../lib/subscription.js'
import { Spinner } from '../../components/ui.jsx'
import { IconTag, IconCheck, IconUsers, IconWarn, IconWallet, IconReceipt } from '../../components/icons.jsx'
import PlanCheckout from './PlanCheckout.jsx'
import PlanGatewayCheckout from './PlanGatewayCheckout.jsx'

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
  const [cycle, setCycle] = useState('monthly') // 'monthly' | 'yearly'

  const load = async () => {
    const [m, tenants, pays] = await Promise.all([db.getManager(userId), db.listTenants(userId), db.listSubscriptionPayments(userId)])
    setManager(m)
    setTenantCount(tenants.length)
    setSubPays(pays)
    setCapacity(m?.plan_capacity || Math.max(10, Math.ceil((tenants.length || 1) / 5) * 5))
    setCycle(m?.plan_cycle === 'yearly' ? 'yearly' : 'monthly')
    setLoading(false)
  }
  useEffect(() => { load() }, [userId])

  if (loading) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>

  const price = priceForCapacity(capacity)       // monthly tier price
  const chargeNow = installmentAmount(price, cycle) // what's charged per installment (yearly = ×12)
  const tier = tierForCapacity(capacity)
  const active = manager?.plan_active
  const onboarding = manager?.onboarded === false
  const tooSmall = capacity < tenantCount
  const cur = Number(manager?.plan_price || 0)

  // Trial / cancellation state.
  const trialEndsAt = manager?.trial_ends_at ? new Date(manager.trial_ends_at) : null
  const onTrial = active && trialEndsAt && trialEndsAt > new Date() && subPays.length === 0
  const hadTrial = !!manager?.trial_ends_at // one trial per manager
  const canceled = !!manager?.plan_canceled_at
  const trialDaysLeft = onTrial ? Math.max(0, Math.ceil((trialEndsAt - new Date()) / 86400000)) : 0

  // Has the manager already paid for THIS calendar month?
  const now = new Date()
  const paidThisMonth = subPays.some((p) => {
    const d = new Date(p.created_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  // When the next installment falls due — a month on from the last payment, or
  // from the plan start if none has been recorded yet.
  const dueDate = onTrial ? trialEndsAt : nextDue(subPays[0]?.created_at || manager?.plan_started_at)
  // Compare whole days, without mutating dueDate (setHours returns a timestamp
  // but changes the Date in place — fmtDate below still needs the original).
  const atMidnight = (d) => new Date(d).setHours(0, 0, 0, 0)
  const dueDays = Math.round((atMidnight(dueDate) - atMidnight(new Date())) / 86400000)
  const dueLabel = dueDays < 0 ? `${Math.abs(dueDays)} day${Math.abs(dueDays) === 1 ? '' : 's'} overdue`
    : dueDays === 0 ? 'Due today'
    : dueDays === 1 ? 'Due tomorrow'
    : `Due in ${dueDays} days`

  const samePlan = active && capacity === manager.plan_capacity
  // Upgrading within a month you've already paid → only owe the difference.
  const isUpgrade = active && paidThisMonth && price > cur && !samePlan
  const isDowngrade = active && paidThisMonth && price < cur && !samePlan
  const upgradeDue = Math.max(0, price - cur)

  // Decide what to charge when the plan button is pressed.
  const changePlan = async () => {
    if (tooSmall) return toast.error('Capacity too small', `You already have ${tenantCount} tenants.`)
    if (samePlan) return toast.info('You’re already on this plan')
    if (!active) {
      // Fresh start: offer the 7-day free trial once; after that, activate & pay.
      setCheckout(hadTrial
        ? { mode: 'activate', capacity, price: chargeNow, charge: chargeNow, credit: 0, tierName: tier.name, cycle }
        : { mode: 'trial', capacity, price: chargeNow, tierName: tier.name, cycle })
      return
    }
    if (isDowngrade) {
      // Cheaper plan — effective now, nothing to pay (you've already paid more this month).
      setBusy(true)
      try {
        // Same server path as activation — plan columns are no longer writable
        // by the manager directly (migration 0019).
        await db.startOwnPlan(capacity)
        await refresh()
        toast.success('Plan changed', `Switched to ${tier.name} · ${money(price)}/month. No charge — you’ve already paid this month.`)
        await load()
      } catch (e) { toast.error('Could not change', e.message) } finally { setBusy(false) }
      return
    }
    if (isUpgrade) {
      setCheckout({ mode: 'upgrade', capacity, price, charge: upgradeDue, credit: cur, tierName: tier.name, cycle })
      return
    }
    setCheckout({ mode: 'activate', capacity, price: chargeNow, charge: chargeNow, credit: 0, tierName: tier.name, cycle })
  }
  const payInstallment = () => setCheckout({
    mode: 'installment', capacity: manager.plan_capacity,
    price: installmentAmount(manager.plan_price, cycle),
    tierName: tierForCapacity(manager.plan_capacity).name, cycle,
  })

  // Called by the checkout once the (placeholder) payment goes through.
  //
  // Activation runs through db.startOwnPlan, NOT updateManagerSettings: since
  // migration 0019 a manager cannot write their own plan columns, so the API
  // does it with the service role and derives the price from capacity there.
  // The App owner can still override any of this from the admin console.
  const handlePaid = async ({ card, reference, trial }) => {
    // Free trial: save the card, start the plan on trial, charge nothing now.
    if (trial || checkout.mode === 'trial') {
      await db.startOwnPlan(checkout.capacity, { trial: true, cycle: checkout.cycle })
      await db.updateManagerSettings(userId, { billing_card: card })
      await refresh()
      const end = new Date(Date.now() + 7 * 86400000)
      toast.success('Free trial started', `7 days free — your first payment of ${money(checkout.price)} is on ${fmtDate(end)}. Cancel any time before then and you won’t be charged.`)
      const wasOnboarding = onboarding
      setCheckout(null)
      if (wasOnboarding) nav('/manager'); else load()
      return
    }
    if (checkout.mode === 'activate' || checkout.mode === 'upgrade') {
      await db.startOwnPlan(checkout.capacity, { cycle: checkout.cycle })
    } else if (checkout.mode === 'installment' && checkout.cycle && checkout.cycle !== manager.plan_cycle) {
      // Paying an installment on a different cycle switches the plan to it.
      await db.startOwnPlan(checkout.capacity, { cycle: checkout.cycle })
    }
    await db.updateManagerSettings(userId, { billing_card: card })

    const paidAmount = checkout.charge ?? checkout.price
    const period = checkout.mode === 'upgrade'
      ? `Upgrade to ${checkout.tierName} · ${monthYear(new Date(), true)}`
      : monthYear(new Date(), true)
    await db.recordSubscriptionPayment(userId, {
      amount: paidAmount, period,
      method: `${card.brand} ····${card.last4}`, reference,
    })
    await refresh()
    toast.success('Plan activated', checkout.mode === 'upgrade'
      ? `Upgraded to ${checkout.tierName} (credited ${money(checkout.credit)} for your current plan).`
      : `You're on the ${checkout.tierName} plan.`)
    const wasOnboardingActivate = onboarding && checkout.mode === 'activate'
    setCheckout(null)
    if (wasOnboardingActivate) nav('/manager'); else load()
  }

  const cancelMembership = async () => {
    if (!window.confirm('Cancel your membership? You keep access until the end of your current period, then it won’t renew. No refund is given for the current period.')) return
    setBusy(true)
    try {
      await db.cancelOwnPlan(); await refresh()
      toast.success('Membership cancelled', 'Access continues until your period ends — it won’t renew.')
      await load()
    } catch (e) { toast.error('Could not cancel', e.message) } finally { setBusy(false) }
  }
  const resumeMembership = async () => {
    setBusy(true)
    try {
      await db.resumeOwnPlan(); await refresh()
      toast.success('Membership resumed', 'Your plan will keep renewing.')
      await load()
    } catch (e) { toast.error('Could not resume', e.message) } finally { setBusy(false) }
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
          <div>Your account is ready — choose a capacity below and <b>start your 7-day free trial</b>. You won’t be charged today, and you can cancel any time before it ends.</div>
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

      {onTrial && (
        <div className="banner gold" style={{ marginBottom: 18 }}>
          <div className="b-ico"><IconTag size={18} /></div>
          <div>
            <b>Free trial — {trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'} left.</b> Your card is saved; your first
            payment of {money(manager.plan_price)} falls on {fmtDate(trialEndsAt)}. Cancel before then and you won’t be charged.
          </div>
        </div>
      )}

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
            <div className="mono" style={{ fontFamily: 'var(--serif)', fontSize: '2.6rem', fontWeight: 600, lineHeight: 1, color: 'var(--gold)' }}>{money(chargeNow)}</div>
            <div className="muted" style={{ fontSize: '0.8rem' }}>{cycle === 'yearly' ? `per year · ${money(price)}/mo` : 'per month'}</div>
          </div>
        </div>

        {/* Billing cycle */}
        <div className="seg" style={{ marginTop: 16, maxWidth: 320 }}>
          <button type="button" className={cycle === 'monthly' ? 'on' : ''} onClick={() => setCycle('monthly')}>Monthly</button>
          <button type="button" className={cycle === 'yearly' ? 'on' : ''} onClick={() => setCycle('yearly')}>Yearly · pay {money(installmentAmount(price, 'yearly'))}</button>
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
          {!active ? (hadTrial ? `Activate & pay ${money(chargeNow)}/${cycle === 'yearly' ? 'year' : 'month'}` : 'Start 7-day free trial')
            : samePlan ? 'Your current plan'
            : isUpgrade ? `Upgrade now — pay ${money(upgradeDue)}`
            : isDowngrade ? `Switch to ${tier.name} (no charge now)`
            : `Update & pay ${money(chargeNow)}/${cycle === 'yearly' ? 'year' : 'month'}`}
        </button>
      </div>

      {/* Billing — when the next installment falls due. Past installments are
          deliberately not listed: what a manager needs here is what's coming,
          not a ledger of what's gone. */}
      {active && (
        <div className="card pad" style={{ marginBottom: 18 }}>
          <div className="spread wrap" style={{ gap: 12, marginBottom: 14 }}>
            <div className="row gap">
              <span style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--gold)' }}><IconWallet size={18} /></span>
              <div>
                <h3 style={{ fontSize: '1.1rem' }}>Billing</h3>
                <div className="muted" style={{ fontSize: '0.82rem' }}>
                  {manager.billing_card
                    ? <>Card on file: <b className="mono" style={{ color: 'var(--text)' }}>{manager.billing_card.brand} ····{manager.billing_card.last4}</b> · exp {manager.billing_card.exp}</>
                    : 'No card on file yet.'}
                </div>
              </div>
            </div>
            <button className="btn primary sm" onClick={payInstallment}>Pay installment now</button>
          </div>

          <div className="next-due">
            <div>
              <div className="eyebrow" style={{ color: 'var(--gold)' }}>Next payment</div>
              <div className="nd-date">{fmtDate(dueDate)}</div>
              <div className={`nd-when ${dueDays < 0 ? 'late' : ''}`}>{dueLabel}</div>
            </div>
            <div className="nd-amount mono">{money(manager.plan_price)}</div>
          </div>

          {canceled ? (
            <div className="spread wrap" style={{ marginTop: 14, gap: 10, padding: '12px 14px', borderRadius: 'var(--radius)', background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
              <span className="muted" style={{ fontSize: '0.84rem' }}>Membership cancelled — access until <b style={{ color: 'var(--text)' }}>{fmtDate(dueDate)}</b>, then it won’t renew.</span>
              <button className="btn ghost sm" onClick={resumeMembership} disabled={busy}>Resume membership</button>
            </div>
          ) : (
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <button className="link-btn" style={{ fontSize: '0.82rem', color: 'var(--text-faint)' }} onClick={cancelMembership} disabled={busy}>Cancel membership</button>
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
        manager?.subscriptions_gateway_live && checkout.mode !== 'trial'
          ? <PlanGatewayCheckout {...checkout}
              onClose={() => setCheckout(null)}
              onDone={async () => { setCheckout(null); await refresh(); await load() }} />
          : <PlanCheckout {...checkout} manager={manager}
              onClose={() => setCheckout(null)} onPaid={handlePaid} />
      )}

      <style>{`
        .next-due { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;
          padding: 16px 18px; border-radius: var(--radius); background: var(--gold-bg); border: 1px solid var(--gold-line); }
        .next-due .nd-date { font-family: var(--serif); font-size: 1.5rem; font-weight: 600; line-height: 1.2; margin-top: 2px; }
        .next-due .nd-when { font-size: 0.84rem; color: var(--text-dim); margin-top: 2px; }
        .next-due .nd-when.late { color: var(--danger); font-weight: 600; }
        .next-due .nd-amount { font-family: var(--serif); font-size: 1.9rem; font-weight: 700; color: var(--gold); }
      `}</style>
    </div>
  )
}
