import { useNavigate } from 'react-router-dom'
import { DEMO_MODE } from '../lib/db.js'
import { IconUsers, IconKey, IconArrowRight, IconShield, IconBuilding, IconWallet, IconBell, IconChart } from '../components/icons.jsx'
import QuickUnlockCard from '../components/QuickUnlockCard.jsx'
import InstallApp from '../components/InstallApp.jsx'

const PREVIEW = [
  { icon: IconBuilding, title: 'Find a home', sub: 'Browse listings and enquire on WhatsApp in one tap.' },
  { icon: IconWallet, title: 'Pay in seconds', sub: 'Card or EcoCash — with an instant receipt every time.' },
  { icon: IconBell, title: 'Never miss rent', sub: 'Reminders, notices and your full payment history.' },
  { icon: IconChart, title: 'Landlords in control', sub: 'Tenants, approvals and finances, all in one place.' },
]

export default function RolePicker() {
  const nav = useNavigate()

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 560, textAlign: 'center' }}>

        <div className="center" style={{ gap: 12, marginBottom: 6 }}>
          <div className="brand-mark">RL</div>
        </div>
        <div className="eyebrow" style={{ color: 'var(--gold)' }}>Property Rental Management · Africa</div>
        <h1 style={{ fontSize: '3.2rem', marginTop: 6, lineHeight: 1 }}>RentLoja</h1>
        <p className="muted" style={{ marginTop: 10, fontSize: '1.05rem' }}>
          Rent, receipts and records — handled. Sign in to continue.
        </p>

        <QuickUnlockCard />

        {/* Tenant — the prominent entry point */}
        <div className="theme-tenant" style={{ marginTop: 34 }}>
          <button className="role-card tenant" onClick={() => nav('/tenant/login')}>
            <div className="role-ico"><IconUsers size={26} /></div>
            <div style={{ textAlign: 'left', flex: 1 }}>
              <div className="role-title">I'm a Tenant</div>
              <div className="role-sub">Pay rent, view receipts &amp; notices</div>
            </div>
            <IconArrowRight size={22} />
          </button>
        </div>

        {/* Manager — deliberately small / understated. (App owner has no visible
            entry: reach the admin console directly at /admin.) */}
        <div className="row gap" style={{ marginTop: 18, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="role-mini" onClick={() => nav('/manager/auth')}>
            <IconKey size={14} />
            <span>Property Manager sign in</span>
            <IconArrowRight size={13} style={{ opacity: 0.6 }} />
          </button>
        </div>

        {/* Public: browse advertised rentals with no account. */}
        <button className="role-card public" onClick={() => nav('/rent')} style={{ marginTop: 22 }}>
          <div className="role-ico gold"><IconBuilding size={24} /></div>
          <div style={{ textAlign: 'left', flex: 1 }}>
            <div className="role-title" style={{ fontSize: '1.35rem' }}>Rooms &amp; houses to rent</div>
            <div className="role-sub">See what’s available now — open to everyone, no sign-in</div>
          </div>
          <IconArrowRight size={20} />
        </button>

        {/* A quick preview of what the app does, before signing in. */}
        <div className="preview">
          <div className="eyebrow" style={{ color: 'var(--text-faint)', marginBottom: 12 }}>A quick look at what you get</div>
          <div className="preview-grid">
            {PREVIEW.map(({ icon: Icon, title, sub }) => (
              <div key={title} className="pv-card">
                <div className="pv-ico"><Icon size={17} /></div>
                <div className="pv-t">{title}</div>
                <div className="pv-s">{sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Only appears when the device can actually install it (and isn't already). */}
        <InstallApp />

        {DEMO_MODE && (
          <div className="demo-note">
            <IconShield size={14} />
            <span>Running in <b>demo mode</b> — no setup needed. Try manager <code>demo@rentflow.app</code> / <code>demo1234</code>, or a tenant <code>rudo@example.com</code> / <code>tenant123</code>.</span>
          </div>
        )}
      </div>

      <style>{`
        .brand-mark {
          width: 60px; height: 60px; border-radius: 16px; display: grid; place-items: center;
          background: var(--gold-bg); border: 1px solid var(--gold-line); color: var(--gold);
          font-family: var(--serif); font-weight: 700; font-size: 1.9rem;
        }
        .role-card {
          width: 100%; display: flex; align-items: center; gap: 18px; text-align: left;
          padding: 22px 24px; border-radius: var(--radius-lg); color: var(--text);
          background: linear-gradient(135deg, rgba(90,173,126,0.14), rgba(90,173,126,0.04));
          border: 1px solid var(--green-line); transition: all 0.18s; box-shadow: var(--shadow-soft);
        }
        .role-card:hover { transform: translateY(-2px); border-color: var(--green); box-shadow: 0 22px 48px -24px var(--green); }
        .role-card .role-ico {
          width: 56px; height: 56px; border-radius: 15px; display: grid; place-items: center;
          background: var(--green-bg); border: 1px solid var(--green-line); color: var(--green); flex-shrink: 0;
        }
        .role-title { font-family: var(--serif); font-size: 1.6rem; font-weight: 600; }
        .role-sub { color: var(--text-dim); font-size: 0.92rem; }
        .role-card svg:last-child { color: var(--green); }
        .role-mini {
          display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 99px;
          background: transparent; border: 1px solid var(--line); color: var(--text-faint);
          font-size: 0.84rem; font-weight: 500; transition: all 0.16s;
        }
        .role-mini:hover { color: var(--gold); border-color: var(--gold-line); background: var(--gold-bg); }
        .role-ico.gold { background: var(--gold-bg); border-color: var(--gold-line); color: var(--gold); }
        .role-card.public {
          background: linear-gradient(135deg, rgba(200,168,75,0.13), rgba(200,168,75,0.03));
          border-color: var(--gold-line);
        }
        .role-card.public:hover { border-color: var(--gold); box-shadow: 0 22px 48px -24px var(--gold); }
        .role-card.public svg:last-child { color: var(--gold); }
        .preview { margin-top: 34px; text-align: left; }
        .preview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .pv-card { background: var(--bg-raised); border: 1px solid var(--line-soft); border-radius: var(--radius); padding: 15px 16px; }
        .pv-ico {
          width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center;
          background: var(--surface-2); color: var(--gold); margin-bottom: 10px;
        }
        .pv-t { font-weight: 600; font-size: 0.95rem; }
        .pv-s { color: var(--text-dim); font-size: 0.82rem; margin-top: 3px; line-height: 1.45; }
        @media (max-width: 560px) { .preview-grid { grid-template-columns: 1fr; } }
        .demo-note {
          margin-top: 30px; display: flex; gap: 9px; align-items: flex-start; text-align: left;
          font-size: 0.8rem; color: var(--text-faint); background: var(--bg-raised);
          border: 1px solid var(--line-soft); border-radius: var(--radius); padding: 13px 15px;
        }
        .demo-note svg { color: var(--gold); flex-shrink: 0; margin-top: 1px; }
        .demo-note code { color: var(--text-dim); background: var(--surface-2); padding: 1px 5px; border-radius: 4px; font-size: 0.76rem; }
      `}</style>
    </div>
  )
}
