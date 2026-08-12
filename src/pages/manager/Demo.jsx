import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { money } from '../../lib/format.js'
import { StatCard, StatusPill } from '../../components/ui.jsx'
import { DonutChart } from '../../components/Charts.jsx'
import {
  IconWallet, IconClock, IconBuilding, IconCheckCircle, IconUsers, IconReceipt,
  IconSparkle, IconArrowRight, IconKey,
} from '../../components/icons.jsx'

// Public product tour — anyone can open it from the landing page (no account).
// All data here is illustrative sample data, not a real workspace.
export default function Demo() {
  const nav = useNavigate()
  const [side, setSide] = useState('manager')

  return (
    <div className="pub">
      <header className="pub-top">
        <div className="pub-top-l">
          <Link to="/" className="btn ghost sm">‹ Back</Link>
          <Link to="/" className="pub-brand">RentLoja</Link>
        </div>
        <button className="btn primary sm" onClick={() => nav('/manager/auth')}>Start free trial</button>
      </header>

      <div className="page" style={{ maxWidth: 960 }}>
        <div className="page-head">
          <div className="eyebrow" style={{ color: 'var(--gold)' }}>Product tour</div>
          <h1>See RentLoja in action</h1>
          <p>A live look at both sides of the app, with sample data. No sign-in needed.</p>
        </div>

        {/* Solid, and sticky — it rides up and down with the scroll so you can
            flip between Manager and Tenant at any point in the tour. */}
        <div style={{ position: 'sticky', top: 10, zIndex: 30, display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div className="seg" style={{ background: 'var(--surface)', boxShadow: '0 2px 12px rgba(0,0,0,0.16)' }}>
            <button className={side === 'manager' ? 'on' : ''} onClick={() => setSide('manager')}>Manager side</button>
            <button className={side === 'tenant' ? 'on' : ''} onClick={() => setSide('tenant')}>Tenant side</button>
          </div>
        </div>

        {side === 'manager' ? <ManagerDemo /> : <TenantDemo />}

        {/* AI highlight */}
        <div className="card pad" style={{ marginTop: 16, background: 'var(--gold-bg)', borderColor: 'var(--gold-line)' }}>
          <div className="row gap" style={{ alignItems: 'flex-start' }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--surface)', border: '1px solid var(--gold-line)', color: 'var(--gold)', flexShrink: 0 }}><IconSparkle size={20} /></span>
            <div>
              <div style={{ fontWeight: 600, fontFamily: 'var(--serif)', fontSize: '1.15rem' }}>Built-in AI assistant</div>
              <div className="muted" style={{ fontSize: '0.88rem' }}>Managers and tenants each get an assistant grounded in their own data — ask about arrears, approvals, your rent, balance or receipts and get instant answers. Powered by Claude.</div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="card pad" style={{ marginTop: 24, background: 'var(--gold-bg)', borderColor: 'var(--gold-line)' }}>
          <div className="spread wrap" style={{ gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontFamily: 'var(--serif)', fontSize: '1.2rem' }}>Like what you see?</div>
              <div className="muted" style={{ fontSize: '0.86rem' }}>Start free for a month — add your own properties and tenants. No card, no charge.</div>
            </div>
            <div className="row gap">
              <button className="btn ghost" onClick={() => nav('/rent')}>Browse rentals</button>
              <button className="btn primary" onClick={() => nav('/manager/auth')}>Start free trial <IconArrowRight size={15} /></button>
            </div>
          </div>
        </div>
      </div>

      <style>{PUB_TOP_CSS}</style>
    </div>
  )
}

function FeatureList({ items }) {
  return (
    <div className="card pad">
      <div className="col" style={{ gap: 10 }}>
        {items.map((t, i) => (
          <div key={i} className="row gap" style={{ fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--accent)' }}><IconCheckCircle size={16} /></span>{t}
          </div>
        ))}
      </div>
    </div>
  )
}

const DEMO_TENANTS = [
  { name: 'Rudo Chikore', prop: 'Avondale Heights', unit: 'A1', rent: 350, status: 'paid' },
  { name: 'Farai Ncube', prop: 'Avondale Heights', unit: 'A2', rent: 350, status: 'overdue' },
  { name: 'Tendai Moyo', prop: 'Avondale Heights', unit: 'A3', rent: 350, status: 'paid' },
  { name: 'Kudzai Sibanda', prop: 'Avondale Heights', unit: 'A4', rent: 400, status: 'paid' },
  { name: 'Chipo Dube', prop: 'Borrowdale Villas', unit: 'B1', rent: 600, status: 'paid' },
  { name: 'Nyasha Banda', prop: 'Borrowdale Villas', unit: 'B2', rent: 600, status: 'due' },
  { name: 'Tariro Gwe', prop: 'Borrowdale Villas', unit: 'B3', rent: 600, status: 'paid' },
  { name: 'Blessing Phiri', prop: 'Sunningdale Cluster', unit: 'House 2', rent: 450, status: 'pending' },
]

const DEMO_RECENT = [
  { name: 'Tariro Gwe', amount: 600, method: 'EcoCash', period: 'Jun 2026' },
  { name: 'Rudo Chikore', amount: 350, method: 'Card', period: 'Jun 2026' },
  { name: 'Kudzai Sibanda', amount: 400, method: 'Bank Transfer', period: 'Jun 2026' },
  { name: 'Chipo Dube', amount: 600, method: 'Card', period: 'Jun 2026' },
  { name: 'Tendai Moyo', amount: 350, method: 'InnBucks', period: 'Jun 2026' },
]

function ManagerDemo() {
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="banner gold"><div className="b-ico"><IconKey size={18} /></div>
        <div>This is the <b>manager workspace</b> — your command centre. (Sample data shown.)</div></div>

      <div className="grid stats">
        <StatCard label="Total collected" value={money(18450)} sub="42 approved payments" icon={<IconWallet size={18} />} />
        <StatCard label="Outstanding" value={money(1750)} sub="Across unpaid tenants" icon={<IconClock size={18} />} />
        <StatCard label="Occupancy" value="82%" sub="18 of 22 units" icon={<IconBuilding size={18} />} />
        <StatCard label="Pending approvals" value={3} sub="Awaiting review" icon={<IconCheckCircle size={18} />} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)', alignItems: 'start' }}>
        <div className="card pad">
          <h3 style={{ marginBottom: 14 }}>Rent collection</h3>
          <DonutChart centerValue={money(18450)} centerLabel="Collected"
            segments={[{ label: 'Collected', value: 18450, color: 'var(--green)' }, { label: 'Outstanding', value: 1750, color: 'var(--warn)' }]} />
        </div>
        <div className="card">
          <div className="spread" style={{ padding: '16px 18px 10px' }}><h3>Tenants</h3><span className="pill neutral"><IconUsers size={13} /> {DEMO_TENANTS.length}</span></div>
          <div className="divider" style={{ margin: 0 }} />
          <div className="table-wrap" style={{ border: 'none' }}>
            <table className="data">
              <thead><tr><th>Tenant</th><th>Unit</th><th>Rent</th><th>Status</th></tr></thead>
              <tbody>
                {DEMO_TENANTS.map((t) => (
                  <tr key={t.name}>
                    <td><div style={{ fontWeight: 600 }}>{t.name}</div><div className="muted" style={{ fontSize: '0.76rem' }}>{t.prop}</div></td>
                    <td>{t.unit}</td>
                    <td className="mono">{money(t.rent)}</td>
                    <td><StatusPill status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="spread" style={{ padding: '16px 18px 10px' }}><h3>Recent payments</h3><span className="pill neutral">This month</span></div>
        <div className="divider" style={{ margin: 0 }} />
        <div className="table-wrap" style={{ border: 'none' }}>
          <table className="data">
            <thead><tr><th>Tenant</th><th>For</th><th>Method</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
            <tbody>
              {DEMO_RECENT.map((p, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td className="muted">{p.period}</td>
                  <td>{p.method}</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--gold)' }}>{money(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <FeatureList items={[
        'Add properties, name each unit, and create tenant logins with a WhatsApp credential hand-off',
        'Approve or reject tenant payments and auto-issue receipts',
        'Send notifications to all tenants, a property, or one person',
        'Track collections, costs, occupancy, arrears and payroll at a glance',
        'Ask the built-in AI assistant about arrears, approvals, occupancy and how-tos',
      ]} />
    </div>
  )
}

const DEMO_HISTORY = [
  ['Jun 2026', 'pending'], ['May 2026', 'paid'], ['Apr 2026', 'paid'], ['Mar 2026', 'paid'],
  ['Feb 2026', 'paid'], ['Jan 2026', 'paid'], ['Dec 2025', 'paid'], ['Nov 2025', 'paid'],
]

function TenantDemo() {
  return (
    <div className="theme-tenant col" style={{ gap: 16 }}>
      <div className="banner"><div className="b-ico"><IconUsers size={18} /></div>
        <div>This is the <b>tenant portal</b> — what your tenants see and use. (Sample data shown.)</div></div>

      <div className="banner">
        <div className="b-ico"><IconSparkle size={20} /></div>
        <div className="grow">
          <div style={{ fontWeight: 600 }}>Credit balance: <span className="mono" style={{ color: 'var(--green)' }}>{money(250)}</span></div>
          <div className="muted" style={{ fontSize: '0.86rem' }}>Automatically applied to next month’s rent.</div>
        </div>
      </div>

      <div className="grid stats">
        <StatCard label="Monthly rent" value={money(600)} sub="Due day 5" icon={<IconWallet size={18} />} />
        <StatCard label="Current status" value={<StatusPill status="paid" />} sub="May 2026 → Jun 2026" />
        <StatCard label="Total paid (all time)" value={money(4800)} sub="8 receipts" icon={<IconReceipt size={18} />} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)', alignItems: 'start' }}>
        <div className="card pad">
          <h3 style={{ marginBottom: 14 }}>Paid vs due</h3>
          <DonutChart centerValue={money(4800)} centerLabel="Paid"
            segments={[{ label: 'Paid', value: 4800, color: 'var(--green)' }, { label: 'Not yet paid', value: 600, color: '#e0b15f' }]} />
        </div>
        <div className="card pad">
          <h3 style={{ marginBottom: 10 }}>Ways to pay</h3>
          <div className="row gap wrap" style={{ marginBottom: 14 }}>
            {['Card', 'EcoCash', 'Cash USD', 'InnBucks', 'Bank Transfer', 'Mukuru'].map((m) => <span key={m} className="pill green">{m}</span>)}
          </div>
          <h3 style={{ margin: '4px 0 10px', fontSize: '1rem' }}>Payment history</h3>
          <div className="col" style={{ gap: 8 }}>
            {DEMO_HISTORY.map(([mo, st]) => (
              <div key={mo} className="spread" style={{ fontSize: '0.86rem' }}>
                <span className="row gap"><IconReceipt size={14} /> {mo}</span>
                <StatusPill status={st} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <FeatureList items={[
        'Pay rent by card, EcoCash (PIN to phone), or upload proof for manual methods',
        'See live status, credit balance and a 5-year payment history',
        'Download official receipts for every approved payment',
        'Get notices from the manager with an unread bell',
        'Ask the AI assistant about your rent, balance, payment methods and receipts',
      ]} />
    </div>
  )
}

// Minimal top bar shared look — kept local so the tour renders correctly for a
// logged-out visitor before the app theme hydrates.
const PUB_TOP_CSS = `
  .pub { min-height: 100vh; background: var(--bg); color: var(--text); }
  .pub-top { display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 16px 22px; max-width: 960px; margin: 0 auto; }
  .pub-top-l { display: flex; align-items: center; gap: 12px; }
  .pub-brand { font-weight: 800; font-size: 1.3rem; letter-spacing: -.02em; color: var(--text); text-decoration: none; }
`
