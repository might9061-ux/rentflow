import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { money } from '../../lib/format.js'
import { StatCard, StatusPill, PeriodTag } from '../../components/ui.jsx'
import { DonutChart } from '../../components/Charts.jsx'
import {
  IconWallet, IconClock, IconBuilding, IconCheckCircle, IconUsers, IconReceipt,
  IconSparkle, IconBell, IconArrowRight, IconKey,
} from '../../components/icons.jsx'

const PERIOD = { from: '2026-05-01', to: '2026-06-01' }

export default function Demo() {
  const { profile, userId, refresh } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [side, setSide] = useState('manager')
  const onboarding = profile?.onboarded === false
  const [busy, setBusy] = useState(false)

  const startExploring = async () => {
    setBusy(true)
    try {
      await db.updateManagerSettings(userId, { onboarded: true })
      await refresh()
      toast.info('You’re in', 'Add a property and choose a plan when you’re ready to add tenants.')
      nav('/manager')
    } catch (e) { toast.error('Could not continue', e.message); setBusy(false) }
  }

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="spread page-head wrap" style={{ gap: 12 }}>
        <div>
          <div className="eyebrow">Product tour</div>
          <h1>See RentLoja in action</h1>
          <p>A quick demo of both sides — explore freely, then choose a plan when you’re ready.</p>
        </div>
        <div className="seg">
          <button className={side === 'manager' ? 'on' : ''} onClick={() => setSide('manager')}>Manager side</button>
          <button className={side === 'tenant' ? 'on' : ''} onClick={() => setSide('tenant')}>Tenant side</button>
        </div>
      </div>

      {side === 'manager' ? <ManagerDemo /> : <TenantDemo />}

      {/* CTAs */}
      <div className="card pad" style={{ marginTop: 24, background: 'var(--gold-bg)', borderColor: 'var(--gold-line)' }}>
        <div className="spread wrap" style={{ gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontFamily: 'var(--serif)', fontSize: '1.2rem' }}>Ready to go live?</div>
            <div className="muted" style={{ fontSize: '0.86rem' }}>Pick a monthly plan to start adding your own tenants — or keep exploring first.</div>
          </div>
          <div className="row gap">
            {onboarding && <button className="btn ghost" onClick={startExploring} disabled={busy}>Skip &amp; explore</button>}
            {!onboarding && <button className="btn ghost" onClick={() => nav('/manager')}>Back to dashboard</button>}
            <button className="btn primary" onClick={() => nav('/manager/plan')}>Choose a plan <IconArrowRight size={15} /></button>
          </div>
        </div>
      </div>
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

function ManagerDemo() {
  const tenants = [
    { name: 'Rudo Chikore', unit: 'A1', rent: 350, status: 'paid', credit: 0 },
    { name: 'Farai Ncube', unit: 'A2', rent: 350, status: 'due', credit: 0 },
    { name: 'Chipo Dube', unit: 'V3', rent: 600, status: 'paid', credit: 250 },
  ]
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="banner gold"><div className="b-ico"><IconKey size={18} /></div>
        <div>This is the <b>manager workspace</b> — your command centre. (Sample data shown.)</div></div>

      <div className="grid stats">
        <StatCard label="Total collected" value={money(7000)} sub="15 approved payments" icon={<IconWallet size={18} />} />
        <StatCard label="Outstanding" value={money(700)} sub="Across unpaid tenants" icon={<IconClock size={18} />} />
        <StatCard label="Occupancy" value="67%" sub="6 of 9 units" icon={<IconBuilding size={18} />} />
        <StatCard label="Pending approvals" value={1} sub="Awaiting review" icon={<IconCheckCircle size={18} />} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)' }}>
        <div className="card pad">
          <h3 style={{ marginBottom: 14 }}>Rent collection</h3>
          <DonutChart centerValue={money(7000)} centerLabel="Collected"
            segments={[{ label: 'Collected rent', value: 7000, color: 'var(--green)' }, { label: 'Not yet paid', value: 700, color: '#d98b5f' }]} />
        </div>
        <div className="card">
          <div className="spread" style={{ padding: '16px 18px 10px' }}><h3>Tenants</h3><span className="pill neutral"><IconUsers size={13} /> {tenants.length}</span></div>
          <div className="divider" style={{ margin: 0 }} />
          <div className="table-wrap" style={{ border: 'none' }}>
            <table className="data">
              <thead><tr><th>Tenant</th><th>Unit</th><th>Rent</th><th>Status</th></tr></thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.name}>
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
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

      <FeatureList items={[
        'Add properties and create tenant logins (with a WhatsApp credential hand-off)',
        'Approve or reject tenant payments and auto-issue receipts',
        'Send notifications to all tenants, a property, or one person',
        'Track collections, costs, occupancy and arrears at a glance',
      ]} />
    </div>
  )
}

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
        <StatCard label="Total paid (all time)" value={money(3050)} sub="6 receipts" icon={<IconReceipt size={18} />} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)' }}>
        <div className="card pad">
          <h3 style={{ marginBottom: 14 }}>Paid vs due</h3>
          <DonutChart centerValue={money(3050)} centerLabel="Paid"
            segments={[{ label: 'Paid', value: 3050, color: 'var(--green)' }, { label: 'Not yet paid', value: 0, color: '#e0b15f' }]} />
        </div>
        <div className="card pad">
          <h3 style={{ marginBottom: 10 }}>Ways to pay</h3>
          <div className="row gap wrap" style={{ marginBottom: 14 }}>
            {['Card', 'EcoCash', 'Cash USD', 'InnBucks', 'Bank Transfer', 'Mukuru'].map((m) => <span key={m} className="pill green">{m}</span>)}
          </div>
          <div className="col" style={{ gap: 8 }}>
            {[['Apr 2026', 'paid'], ['May 2026', 'paid'], ['Jun 2026', 'pending']].map(([mo, st]) => (
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
      ]} />
    </div>
  )
}
