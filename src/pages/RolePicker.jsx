import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DEMO_MODE, db, resetDemo } from '../lib/db.js'
import { useAuth } from '../context/AuthContext.jsx'
import {
  IconUsers, IconKey, IconArrowRight, IconShield, IconBuilding, IconWallet, IconBell, IconChart, IconCheck, IconSparkle, IconWrench,
} from '../components/icons.jsx'
import { Spinner } from '../components/ui.jsx'
import QuickUnlockCard from '../components/QuickUnlockCard.jsx'
import InstallApp from '../components/InstallApp.jsx'
import Logo from '../components/Logo.jsx'

const FEATURES = [
  { icon: IconBuilding, title: 'Properties & tenants', sub: 'Set up your buildings, name each unit, and assign tenants — with occupancy and rent at a glance.' },
  { icon: IconWallet, title: 'Collect rent online', sub: 'Tenants pay by card, EcoCash or proof upload. Every payment is logged with an instant receipt.' },
  { icon: IconBell, title: 'Reminders & notices', sub: 'Automatic rent reminders and one-tap notices over WhatsApp and SMS — no more chasing.' },
  { icon: IconChart, title: 'Finances in one place', sub: 'Collected, outstanding, arrears and payroll — a clear picture of every workspace.' },
  { icon: IconSparkle, title: 'Built-in AI assistant', sub: 'Ask about arrears, approvals or your rent and get instant answers — for managers and tenants alike.' },
]

const FAQS = [
  { q: 'Is RentLoja free to try?', a: 'Yes — property managers get a free first month. No card needed to start, nothing is charged until the month ends, and you can cancel any time before then.' },
  { q: 'How much does it cost?', a: 'Plans are billed monthly and priced by how many tenants you manage, starting from $10/month. You’ll see the exact tier on the Plan & billing page after signing up.' },
  { q: 'Is it free for tenants?', a: 'Yes. Tenants pay and track their rent at no cost — their property manager runs the account.' },
  { q: 'How do tenants pay rent?', a: 'By card or EcoCash for an instant receipt, or by uploading proof of a cash/bank payment for the manager to approve.' },
  { q: 'Do I need to install anything?', a: 'No — RentLoja runs in any browser. You can also install it as an app on your phone for quick access.' },
  { q: 'Can I cancel any time?', a: 'Yes. Cancel from Plan & billing; your access continues until the end of the period you’ve paid for. Fees already paid are non-refundable.' },
  { q: 'Is my data secure?', a: 'Data is encrypted in transit and each manager only ever sees their own tenants. See our Privacy Policy for details.' },
]

export default function RolePicker() {
  const nav = useNavigate()
  const { refresh } = useAuth()
  const [openFaq, setOpenFaq] = useState(0)
  const [demoLoading, setDemoLoading] = useState(false)
  const goEnter = () => document.getElementById('enter')?.scrollIntoView({ behavior: 'smooth' })

  // "Try the demo": switch this browser into the seeded demo engine, then reload
  // so `db` binds to the mock. The effect below finishes the sign-in after reload.
  const enterDemo = (role = 'manager') => {
    setDemoLoading(true)
    try {
      resetDemo() // fresh, seeded sample data on every start
      localStorage.setItem('rentflow_demo', '1')
      localStorage.setItem('rentflow_demo_start', role === 'tenant' ? 'tenant' : 'manager')
    } catch {}
    window.location.assign('/')
  }

  // After the reload, if a demo start is pending and we're now in demo mode,
  // sign into the chosen demo account (no credentials) and open that side.
  useEffect(() => {
    let start = null
    try { start = localStorage.getItem('rentflow_demo_start') } catch {}
    if (!start || !DEMO_MODE) return
    setDemoLoading(true)
    try { localStorage.removeItem('rentflow_demo_start') } catch {}
    ;(async () => {
      try {
        if (start === 'tenant') {
          await db.signInTenant({ email: 'rudo@example.com', password: 'tenant123' })
          await refresh()
          nav('/tenant', { replace: true })
        } else {
          await db.signInManager({ email: 'demo@rentflow.app', password: 'demo1234' })
          await refresh()
          nav('/manager', { replace: true })
        }
      } catch { setDemoLoading(false) }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (demoLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', gap: 14 }}>
        <div className="center" style={{ gap: 14 }}>
          <Spinner />
          <div className="muted">Starting your demo…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="lp">
      {/* Top bar */}
      <header className="lp-nav">
        <div className="lp-nav-in">
          <a className="lp-brand" href="#top"><span className="brand-mark sm"><Logo size={19} /></span> RentLoja</a>
          <nav className="lp-nav-r">
            <button className="lp-link" onClick={() => enterDemo('manager')}>Try the demo</button>
            <button className="lp-link" onClick={() => nav('/rent')}>Browse rentals</button>
            <button className="btn primary sm" onClick={goEnter}><IconKey size={14} /> Sign in</button>
          </nav>
        </div>
      </header>

      <div id="top" />

      {/* Hero */}
      <section className="lp-hero">
        <div className="eyebrow" style={{ color: 'var(--gold)' }}>Property rental management · Africa</div>
        <h1>Rent, receipts and records — <span className="hl">handled.</span></h1>
        <p className="lp-sub">
          RentLoja gives property managers one place to collect rent, track payments and manage tenants — and gives
          tenants a simple way to pay and keep every receipt.
        </p>
        <div className="lp-cta">
          <button className="btn primary lg" onClick={() => nav('/manager/auth')}>Start your free month <IconArrowRight size={16} /></button>
          <button className="btn ghost lg" onClick={() => nav('/rent')}>Browse rooms &amp; houses</button>
        </div>
        <div className="lp-trust"><IconCheck size={14} /> 1 month free · no card · cancel anytime</div>
        <div className="lp-demo">
          <span className="lp-demo-label"><IconSparkle size={14} /> Try the live demo — no sign-up:</span>
          <button className="btn ghost sm" onClick={() => enterDemo('manager')}>As a manager</button>
          <button className="btn ghost sm" onClick={() => enterDemo('tenant')}>As a tenant</button>
        </div>
      </section>

      {/* A framed preview of the manager Overview — advertising the real app. */}
      <section className="lp-shot">
        <div className="lp-shot-stage">
        <div className="lp-shot-frame">
          <div className="lp-shot-bar">
            <span className="lp-dot" style={{ background: '#e8705a' }} />
            <span className="lp-dot" style={{ background: '#e8b84b' }} />
            <span className="lp-dot" style={{ background: '#5aad7e' }} />
            <span className="lp-shot-url">rentloja.com/manager</span>
          </div>
          <div className="lp-shot-body">
            <div className="eyebrow" style={{ color: 'var(--gold)' }}>Overview</div>
            <div className="lp-shot-hi">Good day, Tendai</div>
            <div className="lp-shot-stats">
              {[
                { l: 'Total collected', v: '$18,450', s: '42 payments', I: IconWallet },
                { l: 'Outstanding', v: '$1,750', s: 'Unpaid tenants', I: IconChart },
                { l: 'Occupancy', v: '82%', s: '18 / 22 units', I: IconBuilding },
                { l: 'Pending', v: '3', s: 'To approve', I: IconCheck },
              ].map(({ l, v, s, I }) => (
                <div key={l} className="lp-stat">
                  <div className="lp-stat-top"><span className="lp-stat-l">{l}</span><span className="lp-stat-ic"><I size={14} /></span></div>
                  <div className="lp-stat-v">{v}</div>
                  <div className="lp-stat-s">{s}</div>
                </div>
              ))}
            </div>
            <div className="lp-shot-lower">
              <div className="lp-shot-card">
                <div className="lp-shot-ct">Rent collection</div>
                <div className="lp-donut">
                  <svg viewBox="0 0 120 120" aria-hidden="true">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="var(--line)" strokeWidth="13" />
                    <circle cx="60" cy="60" r="50" fill="none" stroke="var(--green)" strokeWidth="13" strokeLinecap="round"
                      strokeDasharray="287 314" transform="rotate(-90 60 60)" />
                    <circle cx="60" cy="60" r="50" fill="none" stroke="var(--warn)" strokeWidth="13" strokeLinecap="round"
                      strokeDasharray="27 314" strokeDashoffset="-289" transform="rotate(-90 60 60)" />
                  </svg>
                  <div className="lp-donut-c"><div className="lp-donut-v">$18,450</div><div className="lp-donut-l">Collected</div></div>
                </div>
              </div>
              <div className="lp-shot-card">
                <div className="lp-shot-ct">Recent payments</div>
                <div className="lp-rows">
                  {[['Tariro Gwe', '$600', 'EcoCash'], ['Rudo Chikore', '$350', 'Card'], ['Kudzai Sibanda', '$400', 'Bank Transfer']].map(([n, a, m]) => (
                    <div key={n} className="lp-row">
                      <div><div className="lp-row-n">{n}</div><div className="lp-row-m">{m}</div></div>
                      <div className="lp-row-a">{a}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
          <div className="lp-notif" style={{ animationDelay: '0s' }}>
            <div className="lp-notif-ic green"><IconBell size={15} /></div>
            <div>
              <div className="lp-notif-t">Payment received</div>
              <div className="lp-notif-s">$600 · Tariro Gwe · EcoCash</div>
            </div>
          </div>
          <div className="lp-notif" style={{ animationDelay: '4s' }}>
            <div className="lp-notif-ic amber"><IconWrench size={15} /></div>
            <div>
              <div className="lp-notif-t">New maintenance request</div>
              <div className="lp-notif-s">Leaking tap · Unit A2</div>
            </div>
          </div>
          <div className="lp-notif" style={{ animationDelay: '8s' }}>
            <div className="lp-notif-ic green"><IconBell size={15} /></div>
            <div>
              <div className="lp-notif-t">Payment received</div>
              <div className="lp-notif-s">$400 · Kudzai Sibanda · Bank</div>
            </div>
          </div>
        </div>
        <div className="lp-shot-cap">A live look at the manager dashboard.</div>
      </section>

      {/* Sign in / role entry */}
      <section id="enter" className="lp-enter">
        <h2>Sign in to RentLoja</h2>
        <p className="muted" style={{ marginTop: 4 }}>Choose how you’re signing in.</p>

        <div className="lp-enter-inner">
          <QuickUnlockCard />

          <div className="theme-tenant">
            <button className="role-card tenant" onClick={() => nav('/tenant/login')}>
              <div className="role-ico"><IconUsers size={24} /></div>
              <div style={{ textAlign: 'left', flex: 1 }}>
                <div className="role-title">I’m a Tenant</div>
                <div className="role-sub">Pay rent, view receipts &amp; notices</div>
              </div>
              <IconArrowRight size={20} />
            </button>
          </div>

          <button className="role-card gold" onClick={() => nav('/manager/auth')}>
            <div className="role-ico gold"><IconKey size={24} /></div>
            <div style={{ textAlign: 'left', flex: 1 }}>
              <div className="role-title">I’m a Property Manager</div>
              <div className="role-sub">Manage properties, tenants &amp; rent</div>
            </div>
            <IconArrowRight size={20} />
          </button>
        </div>

        <InstallApp />

        {DEMO_MODE && (
          <div className="demo-note">
            <IconShield size={14} />
            <span>Running in <b>demo mode</b> — no setup needed. Try manager <code>demo@rentflow.app</code> / <code>demo1234</code>, or a tenant <code>rudo@example.com</code> / <code>tenant123</code>.</span>
          </div>
        )}
      </section>

      {/* Features */}
      <section className="lp-section">
        <div className="eyebrow" style={{ color: 'var(--text-faint)' }}>Everything in one place</div>
        <h2>Run your rentals the easy way</h2>
        <div className="lp-features">
          {FEATURES.map(({ icon: Icon, title, sub }) => (
            <div key={title} className="lp-feature">
              <div className="lp-feature-ico"><Icon size={20} /></div>
              <div className="lp-feature-t">{title}</div>
              <div className="lp-feature-s">{sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="lp-section">
        <div className="lp-pricing">
          <div>
            <div className="eyebrow" style={{ color: 'var(--gold)' }}>Simple monthly pricing</div>
            <h2 style={{ marginTop: 6 }}>Pay for what you need</h2>
            <p className="muted" style={{ maxWidth: 460 }}>
              Plans are priced by how many tenants you manage — from <b style={{ color: 'var(--text)' }}>$10/month</b>.
              Start with a <b style={{ color: 'var(--text)' }}>free first month</b>; you’re only billed once it ends,
              and you can cancel anytime.
            </p>
          </div>
          <button className="btn primary lg" onClick={() => nav('/manager/auth')}>Start free month <IconArrowRight size={16} /></button>
        </div>
      </section>

      {/* FAQ */}
      <section className="lp-section">
        <h2>FAQ</h2>
        <div className="lp-faq">
          {FAQS.map((f, i) => {
            const on = openFaq === i
            return (
              <div key={f.q} className={`faq-item ${on ? 'on' : ''}`}>
                <button className="faq-q" onClick={() => setOpenFaq(on ? -1 : i)} aria-expanded={on}>
                  <span>{f.q}</span><span className="faq-pm">{on ? '−' : '+'}</span>
                </button>
                {on && <div className="faq-a">{f.a}</div>}
              </div>
            )
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-foot">
        <div className="lp-foot-in">
          <div className="lp-foot-links">
            <button className="lp-link" onClick={goEnter}>Sign in / Register</button>
            <button className="lp-link" onClick={() => nav('/rent')}>Browse rentals</button>
            <Link className="lp-link" to="/terms">Terms &amp; Conditions</Link>
            <Link className="lp-link" to="/privacy">Privacy</Link>
            <a className="lp-link" href="mailto:support@rentloja.com">Contact</a>
          </div>
          <div className="lp-foot-legal">© {new Date().getFullYear()} RentLoja · Property rental management for Africa</div>
        </div>
      </footer>

      <style>{`
        .lp { min-height: 100vh; background: var(--bg); color: var(--text); }
        .brand-mark {
          width: 60px; height: 60px; border-radius: 16px; display: grid; place-items: center;
          background: var(--gold-bg); border: 1px solid var(--gold-line); color: var(--gold);
          font-family: var(--serif); font-weight: 700; font-size: 1.9rem;
        }
        .brand-mark.sm { width: 34px; height: 34px; border-radius: 9px; font-size: 1.05rem; }

        /* Nav */
        .lp-nav { position: sticky; top: 0; z-index: 20; background: color-mix(in srgb, var(--bg) 88%, transparent);
          backdrop-filter: blur(10px); border-bottom: 1px solid var(--line-soft); }
        .lp-nav-in { max-width: 1080px; margin: 0 auto; padding: 12px 22px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .lp-brand { display: inline-flex; align-items: center; gap: 10px; font-family: var(--serif); font-weight: 700; font-size: 1.25rem; color: var(--text); text-decoration: none; }
        .lp-nav-r { display: flex; align-items: center; gap: 10px; }
        .lp-link { background: none; border: none; color: var(--text-dim); font-size: 0.9rem; font-weight: 500; cursor: pointer; text-decoration: none; padding: 6px; }
        .lp-link:hover { color: var(--gold); }

        /* Hero */
        .lp-hero { max-width: 1080px; margin: 0 auto; padding: 64px 22px 40px; text-align: center; }
        .lp-hero h1 { font-size: clamp(2.4rem, 7vw, 4rem); line-height: 1.04; margin: 10px auto 0; max-width: 16ch; text-wrap: balance; }
        .lp-hero .hl { color: var(--gold); font-style: italic; }
        .lp-sub { color: var(--text-dim); max-width: 60ch; margin: 20px auto 0; font-size: 1.08rem; line-height: 1.6; }
        .lp-cta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 28px; }
        .lp-trust { display: inline-flex; align-items: center; gap: 8px; margin-top: 18px; color: var(--text-faint); font-size: 0.86rem; }
        .lp-trust svg { color: var(--green); }
        .lp-demo { display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center;
          margin-top: 20px; padding: 10px 14px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line-soft); }
        .lp-demo-label { display: inline-flex; align-items: center; gap: 7px; color: var(--text-dim); font-size: 0.86rem; }
        .lp-demo-label svg { color: var(--gold); }

        /* Framed dashboard preview */
        .lp-shot { max-width: 920px; margin: 4px auto 0; padding: 8px 22px 0; }
        .lp-shot-stage { position: relative; }
        .lp-shot-frame { border-radius: 16px; overflow: hidden; border: 1px solid var(--line);
          background: var(--surface); box-shadow: 0 44px 90px -46px rgba(0,0,0,0.55);
          transform-origin: center; animation: lpBreathe 6s ease-in-out infinite; }
        @keyframes lpBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.018); } }
        /* Incoming payment notification — slides in, holds, slides out, on a loop */
        .lp-notif { position: absolute; top: 62px; right: 20px; z-index: 3;
          display: flex; align-items: center; gap: 10px; padding: 10px 13px; border-radius: 12px;
          background: var(--surface); border: 1px solid var(--gold-line);
          box-shadow: 0 20px 44px -18px rgba(0,0,0,0.45); animation: lpNotif 12s ease-in-out infinite backwards; }
        .lp-notif-ic { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; flex-shrink: 0; }
        .lp-notif-ic.green { background: var(--green-bg); color: var(--green); }
        .lp-notif-ic.amber { background: var(--gold-bg); color: var(--gold); }
        .lp-notif-t { font-weight: 600; font-size: 0.83rem; }
        .lp-notif-s { font-size: 0.73rem; color: var(--text-dim); }
        /* Each notif is on the same 12s loop, staggered 4s apart, so one shows at a time. */
        @keyframes lpNotif {
          0% { opacity: 0; transform: translateX(22px) scale(0.96); }
          3% { opacity: 1; transform: translateX(0) scale(1); }
          25% { opacity: 1; transform: translateX(0) scale(1); }
          30%, 100% { opacity: 0; transform: translateX(22px) scale(0.96); }
        }
        @media (prefers-reduced-motion: reduce) {
          .lp-shot-frame { animation: none; }
          .lp-notif { animation: none; opacity: 0; }
          .lp-notif:first-child { opacity: 1; transform: none; }
        }
        .lp-shot-bar { display: flex; align-items: center; gap: 7px; padding: 10px 14px;
          background: var(--bg-raised); border-bottom: 1px solid var(--line-soft); }
        .lp-dot { width: 11px; height: 11px; border-radius: 50%; flex-shrink: 0; }
        .lp-shot-url { margin-left: 12px; font-size: 0.74rem; color: var(--text-faint);
          background: var(--surface); padding: 3px 14px; border-radius: 99px; border: 1px solid var(--line-soft); }
        .lp-shot-body { padding: 20px; text-align: left; background: var(--bg); }
        .lp-shot-hi { font-family: var(--serif); font-size: 1.5rem; font-weight: 600; margin: 4px 0 16px; }
        .lp-shot-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .lp-stat { background: var(--surface); border: 1px solid var(--line-soft); border-radius: 12px; padding: 13px 14px; }
        .lp-stat-top { display: flex; justify-content: space-between; align-items: center; }
        .lp-stat-l { font-size: 0.7rem; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.04em; }
        .lp-stat-ic { color: var(--gold); display: inline-flex; }
        .lp-stat-v { font-family: var(--serif); font-size: 1.5rem; font-weight: 600; margin-top: 6px; line-height: 1; }
        .lp-stat-s { font-size: 0.72rem; color: var(--text-dim); margin-top: 4px; }
        .lp-shot-lower { display: grid; grid-template-columns: 1fr 1.25fr; gap: 12px; margin-top: 12px; }
        .lp-shot-card { background: var(--surface); border: 1px solid var(--line-soft); border-radius: 12px; padding: 15px; }
        .lp-shot-ct { font-weight: 600; font-size: 0.9rem; margin-bottom: 10px; }
        .lp-donut { position: relative; width: 132px; height: 132px; margin: 4px auto 0; }
        .lp-donut svg { width: 100%; height: 100%; display: block; }
        .lp-donut-c { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; }
        .lp-donut-v { font-family: var(--serif); font-weight: 700; font-size: 1.05rem; }
        .lp-donut-l { font-size: 0.66rem; color: var(--text-faint); }
        .lp-rows { display: flex; flex-direction: column; gap: 12px; }
        .lp-row { display: flex; justify-content: space-between; align-items: center; }
        .lp-row-n { font-weight: 600; font-size: 0.86rem; }
        .lp-row-m { font-size: 0.74rem; color: var(--text-faint); }
        .lp-row-a { font-family: var(--serif); font-weight: 600; color: var(--gold); }
        .lp-shot-cap { text-align: center; color: var(--text-faint); font-size: 0.8rem; margin-top: 12px; }
        @media (max-width: 640px) {
          .lp-shot-stats { grid-template-columns: repeat(2, 1fr); }
          .lp-shot-lower { grid-template-columns: 1fr; }
        }

        /* Enter / sign-in */
        .lp-enter { max-width: 560px; margin: 0 auto; padding: 30px 22px 20px; text-align: center; }
        .lp-enter h2 { font-size: 1.7rem; }
        .lp-enter-inner { margin-top: 22px; display: flex; flex-direction: column; gap: 14px; }
        .role-card {
          width: 100%; display: flex; align-items: center; gap: 18px; text-align: left;
          padding: 20px 22px; border-radius: var(--radius-lg); color: var(--text);
          background: linear-gradient(135deg, rgba(90,173,126,0.14), rgba(90,173,126,0.04));
          border: 1px solid var(--green-line); transition: all 0.18s; box-shadow: var(--shadow-soft); cursor: pointer;
        }
        .role-card:hover { transform: translateY(-2px); border-color: var(--green); box-shadow: 0 22px 48px -24px var(--green); }
        .role-card.gold { background: linear-gradient(135deg, var(--gold-bg), transparent); border-color: var(--gold-line); }
        .role-card.gold:hover { border-color: var(--gold); box-shadow: 0 22px 48px -24px var(--gold); }
        .role-card .role-ico {
          width: 54px; height: 54px; border-radius: 15px; display: grid; place-items: center;
          background: var(--green-bg); border: 1px solid var(--green-line); color: var(--green); flex-shrink: 0;
        }
        .role-card .role-ico.gold { background: var(--gold-bg); border-color: var(--gold-line); color: var(--gold); }
        .role-title { font-family: var(--serif); font-size: 1.5rem; font-weight: 600; }
        .role-sub { color: var(--text-dim); font-size: 0.9rem; }
        .role-card svg:last-child { color: var(--green); }
        .role-card.gold svg:last-child { color: var(--gold); }

        .demo-note {
          margin-top: 24px; display: flex; gap: 9px; align-items: flex-start; text-align: left;
          font-size: 0.8rem; color: var(--text-faint); background: var(--bg-raised);
          border: 1px solid var(--line-soft); border-radius: var(--radius); padding: 13px 15px;
        }
        .demo-note svg { color: var(--gold); flex-shrink: 0; margin-top: 1px; }
        .demo-note code { color: var(--text-dim); background: var(--surface-2); padding: 1px 5px; border-radius: 4px; font-size: 0.76rem; }

        /* Generic sections */
        .lp-section { max-width: 1080px; margin: 0 auto; padding: 40px 22px; }
        .lp-section h2 { font-size: clamp(1.7rem, 4vw, 2.3rem); margin-top: 6px; }

        .lp-features { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-top: 22px; }
        .lp-feature { background: var(--surface); border: 1px solid var(--line-soft); border-radius: var(--radius-lg); padding: 20px; }
        .lp-feature-ico { width: 42px; height: 42px; border-radius: 11px; display: grid; place-items: center; background: var(--gold-bg); border: 1px solid var(--gold-line); color: var(--gold); margin-bottom: 12px; }
        .lp-feature-t { font-weight: 600; font-size: 1.05rem; }
        .lp-feature-s { color: var(--text-dim); font-size: 0.9rem; margin-top: 5px; line-height: 1.5; }

        .lp-pricing { display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap;
          background: linear-gradient(135deg, var(--gold-bg), var(--surface)); border: 1px solid var(--gold-line);
          border-radius: var(--radius-lg); padding: 30px; }

        .lp-faq { margin-top: 20px; border-top: 1px solid var(--line-soft); }
        .faq-item { border-bottom: 1px solid var(--line-soft); }
        .faq-q { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 16px;
          background: none; border: none; color: var(--text); text-align: left; cursor: pointer;
          padding: 18px 4px; font-size: 1.02rem; font-weight: 500; }
        .faq-q:hover { color: var(--gold); }
        .faq-pm { font-size: 1.4rem; color: var(--gold); line-height: 1; flex-shrink: 0; }
        .faq-a { color: var(--text-dim); font-size: 0.94rem; line-height: 1.6; padding: 0 4px 18px; max-width: 70ch; }

        /* Footer */
        .lp-foot { border-top: 1px solid var(--line-soft); margin-top: 20px; }
        .lp-foot-in { max-width: 1080px; margin: 0 auto; padding: 30px 22px 50px; }
        .lp-foot-links { display: flex; flex-wrap: wrap; gap: 18px; }
        .lp-foot-legal { color: var(--text-faint); font-size: 0.8rem; margin-top: 18px; }

        @media (max-width: 560px) {
          .lp-hero { padding-top: 44px; }
          .lp-cta .btn { width: 100%; justify-content: center; }
        }
      `}</style>
    </div>
  )
}
