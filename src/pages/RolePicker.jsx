import { useNavigate } from 'react-router-dom'
import { DEMO_MODE } from '../lib/db.js'
import { IconUsers, IconKey, IconArrowRight, IconShield } from '../components/icons.jsx'
import QuickUnlockCard from '../components/QuickUnlockCard.jsx'
import InstallApp from '../components/InstallApp.jsx'

export default function RolePicker() {
  const nav = useNavigate()

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 520, textAlign: 'center' }}>

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
