import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { useTheme } from '../../context/ThemeContext.jsx'
import { db } from '../../lib/db.js'
import { paymentMethodsFor, acceptedMethods } from '../../lib/methods.js'
import { CURRENCIES, marketFor, currencyOptions } from '../../lib/markets.js'
import { canBrand } from '../../lib/brand.js'
import { tierForCapacity } from '../../lib/pricing.js'
import { money, fmtDate } from '../../lib/format.js'
import { Spinner } from '../../components/ui.jsx'
import Logo from '../../components/Logo.jsx'
import PushToggle from '../../components/PushToggle.jsx'
import { IconWallet, IconPhone, IconReceipt, IconSun, IconMoon, IconCheck, IconTag, IconPalette } from '../../components/icons.jsx'

const onlineIcon = (k) => (k === 'card' ? IconWallet : IconPhone)

export default function Settings() {
  const { userId, refresh } = useAuth()
  const toast = useToast()
  const { theme, setTheme } = useTheme()
  const [loading, setLoading] = useState(true)
  const [manager, setManager] = useState(null)
  const [wmId, setWmId] = useState(null)
  const [country, setCountry] = useState('ZW')
  const [currency, setCurrency] = useState('USD')          // primary (display) currency
  const [currencies, setCurrencies] = useState(['USD'])    // accepted currencies (one or both)
  const [enabled, setEnabled] = useState(new Set())
  const [details, setDetails] = useState({}) // { [methodKey]: 'where to pay…' }
  const [notifyAi, setNotifyAi] = useState(false)
  const [notifyAgentThreads, setNotifyAgentThreads] = useState(false)
  const [hasAgents, setHasAgents] = useState(false)
  const [aiSelf, setAiSelf] = useState(true)
  const [aiTenants, setAiTenants] = useState(true)
  const [refundsEnabled, setRefundsEnabled] = useState(false)
  const [lateFee, setLateFee] = useState({ enabled: false, type: 'flat', amount: '', grace: 3 })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    (async () => {
      const m = await db.getWorkspaceManager(userId)
      setManager(m)
      setWmId(m?.id || userId)
      setCountry(m?.country || 'ZW')
      const prim = m?.currency || marketFor(m?.country).currency
      setCurrency(prim)
      setCurrencies(m?.currencies?.length ? m.currencies : [prim])
      setEnabled(new Set(acceptedMethods(m)))
      setDetails(m?.payment_details || {})
      setNotifyAi(!!m?.notify_on_tenant_ai)
      setNotifyAgentThreads(!!m?.notify_agent_threads)
      setRefundsEnabled(!!m?.refunds_enabled)
      setAiSelf(m?.ai_enabled_self !== false)
      setAiTenants(m?.ai_enabled_tenants !== false)
      setLateFee({
        enabled: !!m?.late_fee_enabled, type: m?.late_fee_type || 'flat',
        amount: m?.late_fee_amount ?? '', grace: m?.late_fee_grace_days ?? 3,
      })
      // Only worth offering the agent switch if there are agents. A failure
      // here just hides an optional toggle, so it must not block Settings.
      try { setHasAgents((await db.listTeam(userId)).some((x) => x.role === 'staff')) } catch { /* solo */ }
      setLoading(false)
    })()
  }, [userId])

  // Toggle an accepted currency (keep at least one; keep `currency` a valid primary).
  const toggleCurrency = (code) => {
    setCurrencies((cur) => {
      const has = cur.includes(code)
      let next = has ? cur.filter((c) => c !== code) : [...cur, code]
      if (next.length === 0) next = [code]
      if (!next.includes(currency)) setCurrency(next[0])
      return next
    })
  }

  const setDetail = (key, value) => setDetails((d) => ({ ...d, [key]: value }))

  const toggle = (key) => {
    setEnabled((cur) => {
      const next = new Set(cur)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const save = async () => {
    if (enabled.size === 0) return toast.error('Enable at least one method', 'Tenants need a way to pay.')
    setBusy(true)
    try {
      const options = paymentMethodsFor({ country })
      const list = options.filter((m) => enabled.has(m.key)).map((m) => m.key)
      const cleanDetails = {}
      for (const m of options) {
        const v = (details[m.key] || '').trim()
        if (v && enabled.has(m.key)) cleanDetails[m.key] = v
      }
      await db.updateManagerSettings(wmId, {
        country, currency, currencies,
        accepted_methods: list, payment_details: cleanDetails,
        notify_on_tenant_ai: notifyAi, ai_enabled_self: aiSelf, ai_enabled_tenants: aiTenants,
        notify_agent_threads: notifyAgentThreads,
        refunds_enabled: refundsEnabled,
        late_fee_enabled: lateFee.enabled, late_fee_type: lateFee.type,
        late_fee_amount: Number(lateFee.amount) || 0, late_fee_grace_days: Number(lateFee.grace) || 0,
      })
      await refresh()
      toast.success('Settings saved', 'Tenants will see the updated options.')
    } catch (err) { toast.error('Could not save', err.message) }
    finally { setBusy(false) }
  }

  if (loading) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>

  const options = paymentMethodsFor({ country })
  const online = options.filter((m) => m.kind === 'online')
  const manual = options.filter((m) => m.kind === 'manual')
  const market = marketFor(country)
  const cur = CURRENCIES[currency] || CURRENCIES.USD

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div className="page-head">
        <div className="eyebrow">Configuration</div>
        <h1>Settings</h1>
        <p>Appearance, notifications, payment methods and more.</p>
      </div>

      <PushToggle blurb="Get alerted on this device when a payment comes in or a tenant sends a message — even when RentLoja is closed." />

      <PlanSummary manager={manager} />
      <BrandingSummary manager={manager} />

      <Section title="Appearance" subtitle="Choose a dark or light background for the app.">
        <div className="row gap wrap">
          <button type="button" className={`theme-pick ${theme === 'dark' ? 'on' : ''}`} onClick={() => setTheme('dark')}>
            <span className="tp-swatch" style={{ background: '#0d131c', borderColor: '#27384b' }} />
            <span className="row gap"><IconMoon size={15} /> Dark</span>
          </button>
          <button type="button" className={`theme-pick ${theme === 'light' ? 'on' : ''}`} onClick={() => setTheme('light')}>
            <span className="tp-swatch" style={{ background: '#eef2f7', borderColor: '#d5e0ec' }} />
            <span className="row gap"><IconSun size={15} /> Light</span>
          </button>
        </div>
      </Section>

      <Section title="Currency" subtitle="Zimbabwe is dual-currency — choose which you accept and which amounts display in across the app.">
        <div className="field-row" style={{ marginBottom: 6 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Show amounts in</label>
            <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {currencies.map((code) => <option key={code} value={code}>{code} ({(CURRENCIES[code] || {}).symbol})</option>)}
            </select>
          </div>
        </div>

        <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
          <label>Currencies you accept {currencyOptions(country).length > 1 && <span className="muted" style={{ fontWeight: 400 }}>· pick one or both</span>}</label>
          <div className="row gap wrap">
            {currencyOptions(country).map((c) => {
              const on = currencies.includes(c.code)
              return (
                <button type="button" key={c.code} className={`cur-chip ${on ? 'on' : ''}`} onClick={() => toggleCurrency(c.code)}>
                  {on ? <IconCheck size={13} /> : null} {c.code} ({c.symbol}){currency === c.code ? ' · primary' : ''}
                </button>
              )
            })}
          </div>
        </div>
        <span className="hint">Amounts display in <b style={{ color: 'var(--text)' }}>{currency}</b> ({cur.symbol}). You accept: {currencies.join(', ')}. Tenants pay in the currency you set. Mobile money: {market.manual.filter((x) => x !== 'Cash' && x !== 'Cash USD' && x !== 'Bank Transfer').join(', ') || '—'}.</span>
      </Section>

      <Section title="Pay online (instant)" subtitle="Gateway-confirmed — a receipt is issued automatically.">
        {online.map((m) => (
          <MethodRow key={m.key} option={m} icon={onlineIcon(m.key)} on={enabled.has(m.key)} onToggle={() => toggle(m.key)} />
        ))}
      </Section>

      <GatewaySection wmId={wmId} />

      <Section title="Manual + proof" subtitle="Tenant uploads a receipt; you approve it from the queue. Add where each payment should go — tenants see it when they choose that method.">
        {manual.map((m) => (
          <div key={m.key}>
            <MethodRow option={m} icon={IconReceipt} on={enabled.has(m.key)} onToggle={() => toggle(m.key)} />
            {enabled.has(m.key) && (
              <textarea className="textarea" style={{ marginTop: 8, minHeight: 72 }}
                placeholder={`Where should tenants send ${m.label}? e.g. account name & number, branch, phone, or office address…`}
                value={details[m.key] || ''} onChange={(e) => setDetail(m.key, e.target.value)} />
            )}
          </div>
        ))}
      </Section>

      <Section title="Late fees" subtitle="Automatically charge tenants who fall behind, after a grace period.">
        <ToggleRow title="Charge a late fee" desc="Applied to tenants still owing after the grace period."
          on={lateFee.enabled} onToggle={() => setLateFee((f) => ({ ...f, enabled: !f.enabled }))} />
        {lateFee.enabled && (
          <div className="field-row" style={{ marginTop: 4 }}>
            <div className="field">
              <label>Fee type</label>
              <select className="select" value={lateFee.type} onChange={(e) => setLateFee((f) => ({ ...f, type: e.target.value }))}>
                <option value="flat">Flat amount ({cur.symbol})</option>
                <option value="percent">% of monthly rent</option>
              </select>
            </div>
            <div className="field">
              <label>{lateFee.type === 'percent' ? 'Percent (%)' : `Amount (${market.currency})`}</label>
              <input className="input" type="number" min="0" step="0.01" value={lateFee.amount}
                onChange={(e) => setLateFee((f) => ({ ...f, amount: e.target.value }))} placeholder={lateFee.type === 'percent' ? '10' : '20'} />
            </div>
            <div className="field">
              <label>Grace (days)</label>
              <input className="input" type="number" min="0" value={lateFee.grace}
                onChange={(e) => setLateFee((f) => ({ ...f, grace: e.target.value }))} />
            </div>
          </div>
        )}
      </Section>

      <Section title="Refunds" subtitle="Choose whether you refund tenant payments. Tenants are shown your policy.">
        <ToggleRow title="Offer refunds"
          desc={refundsEnabled
            ? 'You can refund any approved payment from the Payments → Refunds tab.'
            : 'Refunds are off. Tenants are told this workspace does not offer refunds.'}
          on={refundsEnabled} onToggle={() => setRefundsEnabled((v) => !v)} />
      </Section>

      <Section title="AI assistant" subtitle="The in-app AI copilot. Turn it off for yourself, your tenants, or both.">
        <ToggleRow
          title="My copilot"
          desc="Show the AI assistant in your own workspace."
          on={aiSelf} onToggle={() => setAiSelf((v) => !v)} />
        <ToggleRow
          title="Tenant copilot"
          desc="Let your tenants use the AI assistant in their portal."
          on={aiTenants} onToggle={() => setAiTenants((v) => !v)} />
        {hasAgents && (
          <ToggleRow
            title="Copy me on messages my agents handle"
            desc="Tenant messages go to the agent assigned to that property. You always SEE every conversation and can reply — this only controls whether your phone buzzes too. Off keeps your alerts to properties you handle yourself."
            on={notifyAgentThreads} onToggle={() => setNotifyAgentThreads((v) => !v)} />
        )}
        {aiTenants && (
          <ToggleRow
            title="Notify me of tenant questions"
            desc="When on, questions tenants ask their AI assistant appear in your assistant’s “Tenant questions” inbox."
            on={notifyAi} onToggle={() => setNotifyAi((v) => !v)} />
        )}
      </Section>

      <div className="row gap" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
        <span className="muted grow" style={{ fontSize: '0.84rem' }}>{enabled.size} method{enabled.size === 1 ? '' : 's'} enabled</span>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </div>
  )
}

// Icon tile used by the account-level summary cards.
function IconTile({ children }) {
  return (
    <span style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center',
      background: 'var(--gold-bg)', border: '1px solid var(--gold-line)', color: 'var(--gold)', flexShrink: 0 }}>
      {children}
    </span>
  )
}

// A compact read-out of the owner's subscription, with a link to the full
// Plan & billing page for capacity changes, installments and cancellation.
function PlanSummary({ manager }) {
  if (!manager) return null
  const active = !!manager.plan_active
  const onTrial = active && manager.trial_ends_at && new Date(manager.trial_ends_at) > new Date()
  const canceled = active && !!manager.plan_canceled_at
  const tier = manager.plan_capacity ? tierForCapacity(manager.plan_capacity) : null

  let pill, headline, detail
  if (!active) {
    pill = <span className="pill neutral">No plan</span>
    headline = 'No active plan'
    detail = 'Pick a capacity to get started.'
  } else {
    headline = `${tier ? `${tier.name} · ` : ''}${manager.plan_capacity} tenants · ${money(manager.plan_price)}/mo`
    if (canceled) { pill = <span className="pill due">Cancelled</span>; detail = 'Access continues until your period ends, then it won’t renew.' }
    else if (onTrial) { pill = <span className="pill pending">Free trial</span>; detail = `Trial ends ${fmtDate(manager.trial_ends_at)}.` }
    else { pill = <span className="pill ok">Active</span>; detail = manager.plan_started_at ? `Active since ${fmtDate(manager.plan_started_at)}.` : 'Active.' }
  }

  return (
    <Section title="Plan & billing" subtitle="Your subscription, tenant capacity and next payment.">
      <div className="spread wrap" style={{ gap: 12, alignItems: 'center' }}>
        <div className="row gap">
          <IconTile><IconTag size={18} /></IconTile>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{headline}</div>
            <div className="muted" style={{ fontSize: '0.8rem' }}>{detail}</div>
          </div>
        </div>
        <div className="row gap" style={{ alignItems: 'center' }}>
          {pill}
          <Link to="/manager/plan" className="btn primary sm"><IconTag size={14} /> Manage plan</Link>
        </div>
      </div>
    </Section>
  )
}

// A compact read-out of the workspace branding, with a link to the full
// Branding page. Custom branding is a Growth feature (10+ tenants).
function BrandingSummary({ manager }) {
  if (!manager) return null
  const eligible = canBrand(manager)
  const name = (manager.brand_name || '').trim()
  const hasCustom = !!(name || manager.brand_logo || manager.brand_color)

  return (
    <Section title="Branding" subtitle="Your logo, name and colour across the app and your tenants’ portal.">
      {!eligible ? (
        <div className="spread wrap" style={{ gap: 12, alignItems: 'center' }}>
          <div className="muted" style={{ fontSize: '0.82rem' }}>Custom branding is a Growth feature — available on plans with 10 or more tenants.</div>
          <Link to="/manager/plan" className="btn primary sm"><IconTag size={14} /> Upgrade</Link>
        </div>
      ) : (
        <div className="spread wrap" style={{ gap: 12, alignItems: 'center' }}>
          <div className="row gap">
            {manager.brand_logo
              ? <img src={manager.brand_logo} alt="logo" style={{ width: 40, height: 40, borderRadius: 11, objectFit: 'cover', border: '1px solid var(--line)' }} />
              : <IconTile><Logo size={20} /></IconTile>}
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{name || 'RentLoja'} {!hasCustom && <span className="muted" style={{ fontWeight: 400 }}>· default</span>}</div>
              <div className="row gap muted" style={{ fontSize: '0.8rem', alignItems: 'center' }}>
                {manager.brand_color
                  ? <span className="row" style={{ gap: 6, alignItems: 'center' }}><span style={{ width: 12, height: 12, borderRadius: 99, background: manager.brand_color, border: '1px solid var(--line)' }} />{manager.brand_color}</span>
                  : 'Standard RentLoja design'}
              </div>
            </div>
          </div>
          <Link to="/manager/branding" className="btn primary sm"><IconPalette size={14} /> Manage branding</Link>
        </div>
      )}
    </Section>
  )
}

// The provider-specific field labels + help. Both adapters store into the same
// two columns server-side; only the wording differs.
const GATEWAYS = [
  { key: 'pesepay', name: 'Pesepay', idLabel: 'Integration key', keyLabel: 'Encryption key',
    help: 'From your Pesepay dashboard → Integrations. Use your SANDBOX keys while testing, then switch to live keys.' },
  { key: 'paynow', name: 'Paynow', idLabel: 'Integration ID', keyLabel: 'Integration key',
    help: 'From your Paynow account → Integrations (the Integration ID and its matching key).' },
]

// Connect a Pesepay / Paynow merchant account. Keys are write-only from here:
// the server stores them and never sends them back, so once connected the inputs
// stay blank and are only sent again when the owner types a fresh value.
function GatewaySection({ wmId }) {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState({ provider: null, live: false, connected: false })
  const [provider, setProvider] = useState('pesepay')
  const [intId, setIntId] = useState('')
  const [intKey, setIntKey] = useState('')
  const [benef, setBenef] = useState('') // Pesepay merchant email for split payouts
  const [live, setLive] = useState(false)
  const [busy, setBusy] = useState(false)
  // Browsers autofill saved logins into a text field followed by a password
  // field — which would inject the owner's email into the Integration key. Start
  // the key fields readOnly (browsers don't autofill readonly inputs) and unlock
  // on focus, so nothing gets filled behind the owner's back.
  const [locked, setLocked] = useState(true)

  useEffect(() => {
    if (!wmId) return
    (async () => {
      try {
        const s = await db.getPaymentGateway(wmId)
        setStatus(s); setProvider(s.provider || 'pesepay'); setLive(!!s.live); setBenef(s.beneficiary_email || '')
      } catch { /* leave defaults — section still lets them connect */ }
      setLoading(false)
    })()
  }, [wmId])

  const meta = GATEWAYS.find((p) => p.key === provider) || GATEWAYS[0]
  const savedName = GATEWAYS.find((p) => p.key === status.provider)?.name || 'Gateway'

  const save = async () => {
    // Guard against an autofilled email ever being stored as a key.
    if (intId.includes('@') || intKey.includes('@')) {
      return toast.error('That looks like an email', `Paste your ${meta.name} keys (a long token), not your email.`)
    }
    setBusy(true)
    try {
      const s = await db.savePaymentGateway(wmId, {
        provider,
        integration_id: intId.trim() || undefined,
        integration_key: intKey.trim() || undefined,
        beneficiary_email: benef.trim(),
        live,
      })
      setStatus(s); setLive(!!s.live); setIntId(''); setIntKey(''); setBenef(s.beneficiary_email || '')
      toast.success(s.live ? 'Online payments are live' : 'Gateway saved',
        s.split ? 'Split payouts on — you receive rent, the platform takes its fee.'
          : s.connected ? 'Your merchant account is connected.'
            : 'Add your keys, or your Pesepay merchant email, to finish.')
    } catch (err) { toast.error('Could not save', err.message); setLive(status.live) }
    finally { setBusy(false) }
  }

  const disconnect = async () => {
    setBusy(true)
    try {
      const s = await db.disconnectPaymentGateway(wmId)
      setStatus(s); setLive(false); setIntId(''); setIntKey(''); setBenef('')
      toast.success('Disconnected', 'Online payments are switched off.')
    } catch (err) { toast.error('Could not disconnect', err.message) }
    finally { setBusy(false) }
  }

  if (loading) return null

  return (
    <Section title="Connect online payments"
      subtitle="Link your own Pesepay or Paynow merchant account so rent is paid straight to you. Keys are stored securely on the server and are never shown to tenants.">
      <div className="row gap wrap" style={{ marginBottom: 2 }}>
        {status.connected
          ? <span className="cur-chip on"><IconCheck size={13} /> {savedName} connected{status.live ? ' · live' : ' · not live yet'}</span>
          : <span className="muted" style={{ fontSize: '.82rem' }}>Not connected — tenants can still upload proof of manual payments.</span>}
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Provider</label>
        <select className="select" value={provider} onChange={(e) => setProvider(e.target.value)}>
          {GATEWAYS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
        </select>
      </div>

      <div className="field-row">
        <div className="field">
          <label>{meta.idLabel}</label>
          <input className="input" value={intId} onChange={(e) => setIntId(e.target.value)}
            readOnly={locked} onFocus={() => setLocked(false)}
            autoComplete="off" name="pesepay-integration-id" data-lpignore="true" data-1p-ignore data-form-type="other" spellCheck={false}
            placeholder={status.connected ? '•••••••• saved — leave blank to keep' : `Your ${meta.name} ${meta.idLabel.toLowerCase()}`} />
        </div>
        <div className="field">
          <label>{meta.keyLabel}</label>
          <input className="input" type="password" value={intKey} onChange={(e) => setIntKey(e.target.value)}
            readOnly={locked} onFocus={() => setLocked(false)}
            autoComplete="new-password" name="pesepay-encryption-key" data-lpignore="true" data-1p-ignore data-form-type="other" spellCheck={false}
            placeholder={status.connected ? '•••••••• saved — leave blank to keep' : `Your ${meta.name} ${meta.keyLabel.toLowerCase()}`} />
        </div>
      </div>
      <span className="hint">{meta.help}</span>

      {provider === 'pesepay' && (
        <div className="field" style={{ marginTop: 6, marginBottom: 0 }}>
          <label>Pesepay email <span className="muted" style={{ fontWeight: 400 }}>(where your rent is paid)</span></label>
          <input className="input" type="email" value={benef} onChange={(e) => setBenef(e.target.value)}
            autoComplete="off" name="pesepay-payout-email" placeholder="you@example.com" />
          <span className="hint">The email on your Pesepay account. If you’ve accepted the RentLoja split agreement on Pesepay, just this email is enough — rent is paid into this account. (No keys needed.)</span>
        </div>
      )}

      <ToggleRow title="Accept live payments"
        desc={live ? 'Tenants can pay you online right now.' : 'Keep this off until you’ve tested with a small real payment.'}
        on={live} onToggle={() => setLive((v) => !v)} />

      <div className="row gap" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
        {status.connected && <button className="btn ghost danger" onClick={disconnect} disabled={busy}>Disconnect</button>}
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save gateway'}</button>
      </div>
    </Section>
  )
}

function Section({ title, subtitle, children }) {
  return (
    <div className="card pad" style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: '1.15rem' }}>{title}</h3>
      <p className="muted" style={{ fontSize: '0.85rem', marginTop: 2, marginBottom: 14 }}>{subtitle}</p>
      <div className="col" style={{ gap: 10 }}>{children}</div>
    </div>
  )
}

function ToggleRow({ title, desc, on, onToggle }) {
  return (
    <label className="spread" style={{
      padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
      background: on ? 'var(--accent-bg)' : 'var(--bg)', cursor: 'pointer', transition: 'background 0.15s',
    }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{title}</div>
        <div className="muted" style={{ fontSize: '0.78rem' }}>{desc}</div>
      </div>
      <span className="switch">
        <input type="checkbox" checked={on} onChange={onToggle} />
        <span className="track" />
      </span>
    </label>
  )
}

function MethodRow({ option, icon, on, onToggle }) {
  const Icon = icon
  return (
    <label className="spread" style={{
      padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
      background: on ? 'var(--accent-bg)' : 'var(--bg)', cursor: 'pointer', transition: 'background 0.15s',
    }}>
      <div className="row gap">
        <span style={{ width: 36, height: 36, borderRadius: 9, display: 'grid', placeItems: 'center',
          background: 'var(--surface-2)', border: '1px solid var(--line)', color: on ? 'var(--accent)' : 'var(--text-dim)' }}>
          <Icon size={18} />
        </span>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{option.label}</div>
          <div className="muted" style={{ fontSize: '0.78rem' }}>{option.desc}</div>
        </div>
      </div>
      <span className="switch">
        <input type="checkbox" checked={on} onChange={onToggle} />
        <span className="track" />
      </span>
    </label>
  )
}
