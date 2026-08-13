import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { money, fullName, timeAgo } from '../../lib/format.js'
import { prettyPhone } from '../../lib/phone.js'
import { sendWhatsApp } from '../../lib/whatsapp.js'
import { sendSMS } from '../../lib/sms.js'
import { currentPeriod } from '../../lib/billing.js'
import { reminderRules, reminderChannel, remindersEnabled, computeDueReminders, SNOOZE_RULE } from '../../lib/reminders.js'
import { Spinner, EmptyState } from '../../components/ui.jsx'
import Modal from '../../components/Modal.jsx'
import { IconClock, IconWhatsapp, IconSend, IconCheck, IconEdit, IconBell, IconX } from '../../components/icons.jsx'

export default function Reminders() {
  const { userId, profile } = useAuth()
  const toast = useToast()
  const isOwner = profile?.role !== 'staff'

  const [loading, setLoading] = useState(true)
  const [wm, setWm] = useState(null)          // workspace (owner) manager — holds the config
  const [tenants, setTenants] = useState([])
  const [payments, setPayments] = useState([])
  const [properties, setProperties] = useState([])
  const [log, setLog] = useState([])

  // editable config (mirrors wm)
  const [enabled, setEnabled] = useState(true)
  const [channel, setChannel] = useState('whatsapp')
  const [rules, setRules] = useState([])
  const [editRule, setEditRule] = useState(null)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [menuFor, setMenuFor] = useState(null) // tenant id whose ⋯ menu is open

  useEffect(() => {
    if (!menuFor) return
    const close = () => setMenuFor(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuFor])

  const load = useCallback(async () => {
    // Always clear loading, even if a call fails, so the page can never hang on a
    // single rejected request.
    try {
      const [m, t, p, pr, lg] = await Promise.all([
        db.getWorkspaceManager(userId), db.listTenants(userId), db.listPayments(userId),
        db.listProperties(userId), db.listReminderLog(userId),
      ])
      setWm(m); setTenants(t); setPayments(p); setProperties(pr); setLog(lg)
      setEnabled(remindersEnabled(m)); setChannel(reminderChannel(m)); setRules(reminderRules(m))
      setDirty(false)
    } catch (e) { console.error('Reminders load failed', e) }
    finally { setLoading(false) }
  }, [userId])
  useEffect(() => { load() }, [load])

  if (loading) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>

  const due = computeDueReminders({ tenants, payments, properties, manager: wm, log })
  const sentLog = log.filter((l) => l.rule_id !== SNOOZE_RULE)

  // Tenants whose reminders are currently paused — muted (indefinite) or skipped
  // for this billing period — so the manager can cancel/resume them.
  const isSnoozed = (t) => log.some((l) => l.rule_id === SNOOZE_RULE && l.tenant_id === t.id && l.period === currentPeriod(Number(t.due_day) || 1).from)
  const paused = [
    ...tenants.filter((t) => t.reminders_muted).map((t) => ({ t, kind: 'muted' })),
    ...tenants.filter((t) => !t.reminders_muted && isSnoozed(t)).map((t) => ({ t, kind: 'snoozed' })),
  ]

  const setRule = (id, patch) => { setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))); setDirty(true) }

  const saveConfig = async () => {
    setBusy(true)
    try {
      await db.updateManagerSettings(wm.id, { reminders_enabled: enabled, reminder_channel: channel, reminder_rules: rules })
      toast.success('Reminder settings saved')
      await load()
    } catch (e) { toast.error('Could not save', e.message) }
    finally { setBusy(false) }
  }

  const dispatch = (item) => {
    if (channel === 'sms') sendSMS(item.tenant.phone, item.message)
    else sendWhatsApp(item.tenant.phone, item.message)
  }
  // The message text and rule kind go up with the log entry so the server can
  // also drop the reminder into the tenant's in-app inbox and pop it up on
  // their phone — WhatsApp alone is easy to miss in a busy chat list.
  const logEntry = (item) => ({
    tenant_id: item.tenant.id, rule_id: item.rule.id, period: item.periodId, channel, amount: item.amount,
    subject: item.rule.label || 'Rent reminder', message: item.message, kind: item.rule.kind,
  })

  const sendOne = async (item) => {
    dispatch(item)
    await db.logReminderSent(userId, logEntry(item))
    toast.success(`Reminder sent to ${item.tenant.first_name}`)
    load()
  }
  const sendAll = async () => {
    if (!due.length) return
    for (let i = 0; i < due.length; i++) {
      dispatch(due[i])
      await db.logReminderSent(userId, logEntry(due[i]))
      await new Promise((r) => setTimeout(r, 600))
    }
    toast.info(channel === 'whatsapp' ? 'Opening WhatsApp' : 'Opening Messages', `Allow pop-ups to send all ${due.length} reminders.`)
    load()
  }

  const skip = async (item) => { await db.snoozeReminder(userId, item.tenant.id); toast.info(`Skipped ${item.tenant.first_name} this month`); load() }
  const mute = async (item) => { await db.setReminderMuted(userId, item.tenant.id, true); toast.info(`Muted reminders for ${item.tenant.first_name}`); load() }
  const resume = async ({ t, kind }) => {
    if (kind === 'muted') await db.setReminderMuted(userId, t.id, false)
    else await db.cancelSnooze(userId, t.id)
    toast.success(`Reminders resumed for ${t.first_name}`)
    load()
  }

  const tenantName = (id) => fullName(tenants.find((t) => t.id === id))
  const ruleLabel = (id) => rules.find((r) => r.id === id)?.label || id

  return (
    <div className="page" style={{ maxWidth: 880 }}>
      <div className="page-head">
        <div className="eyebrow">Collections</div>
        <h1>Rent reminders</h1>
        <p>Automatic WhatsApp / SMS reminders before rent is due and as it falls overdue — using each tenant’s real balance.</p>
      </div>

      {/* Executive summary bar — the three stat cards folded into one line. */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="spread wrap" style={{ padding: '14px 18px', gap: 10 }}>
          <div className="row gap wrap" style={{ alignItems: 'baseline' }}>
            <b style={{ fontSize: '1.05rem' }}>{enabled ? `${due.length} due now` : 'Reminders off'}</b>
            <span className="muted" style={{ fontSize: '0.84rem' }}>· {channel === 'sms' ? 'SMS' : 'WhatsApp'} · {sentLog.length} sent all-time</span>
          </div>
          {due.length > 0 && enabled && <button className="btn primary sm" onClick={sendAll}><IconSend size={14} /> Send all</button>}
        </div>
        <div className="divider" style={{ margin: 0 }} />
        {!enabled ? (
          <EmptyState icon="🔕" title="Reminders are turned off">Turn them on below to start queuing reminders.</EmptyState>
        ) : due.length === 0 ? (
          <EmptyState icon="✅" title="Nothing due right now">Everyone’s either paid or already reminded this stage.</EmptyState>
        ) : (
          due.map((item) => {
            const dot = item.rule.kind === 'overdue' ? 'var(--danger)' : item.rule.kind === 'due' ? 'var(--warn)' : 'var(--accent)'
            return (
              <div key={item.tenant.id} className="rem-xrow">
                <span className="rem-dot" style={{ background: dot }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{fullName(item.tenant)}</span>
                  <span className="muted"> · {money(item.amount)}{item.daysOverdue > 0 ? ` · ${item.daysOverdue}d overdue` : ''}</span>
                  <div className="muted rem-sub">{item.rule.label} · {prettyPhone(item.tenant.phone)}</div>
                </div>
                <button className={`btn sm ${channel === 'whatsapp' ? 'wa' : 'primary'}`} onClick={() => sendOne(item)}>
                  {channel === 'whatsapp' ? <IconWhatsapp size={14} /> : <IconSend size={14} />} Send
                </button>
                <span style={{ position: 'relative' }}>
                  <button className="btn sm ghost" aria-label="More actions"
                    onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === item.tenant.id ? null : item.tenant.id) }}>⋯</button>
                  {menuFor === item.tenant.id && (
                    <div className="rem-menu" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => { setMenuFor(null); skip(item) }}>Skip this month</button>
                      <button onClick={() => { setMenuFor(null); mute(item) }}>Mute this tenant</button>
                    </div>
                  )}
                </span>
              </div>
            )
          })
        )}
      </div>

      {/* Paused — cancel/resume */}
      {paused.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="spread" style={{ padding: '16px 18px 12px' }}>
            <div>
              <h3>Paused reminders</h3>
              <p className="muted" style={{ fontSize: '0.82rem', marginTop: 2 }}>Muted tenants and ones you’ve skipped this month. Resume any time.</p>
            </div>
          </div>
          <div className="divider" style={{ margin: 0 }} />
          <div style={{ padding: '6px 8px' }}>
            {paused.map(({ t, kind }) => (
              <div key={t.id} className="rem-row">
                <div className="row gap" style={{ flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600 }}>{fullName(t)}</span>
                  <span className={`pill ${kind === 'muted' ? 'rejected' : 'neutral'}`}>
                    {kind === 'muted' ? <><IconBell size={11} /> Muted</> : 'Skipped this month'}
                  </span>
                </div>
                <button className="btn sm ghost" onClick={() => resume({ t, kind })}><IconX size={13} /> {kind === 'muted' ? 'Un-mute' : 'Cancel skip'}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Configuration — owner only */}
      {isOwner && (
        <div className="card pad" style={{ marginBottom: 20 }}>
          <div className="spread wrap" style={{ gap: 12, marginBottom: 14 }}>
            <h3 style={{ fontSize: '1.1rem' }}>Settings</h3>
            <button className="btn primary sm" disabled={busy || !dirty} onClick={saveConfig}>{busy ? 'Saving…' : 'Save changes'}</button>
          </div>

          <label className="rem-toggle">
            <div>
              <div style={{ fontWeight: 600 }}>Automatic reminders</div>
              <div className="muted" style={{ fontSize: '0.8rem' }}>When on, reminders are queued (and sent automatically server-side in production).</div>
            </div>
            <span className="switch"><input type="checkbox" checked={enabled} onChange={() => { setEnabled((v) => !v); setDirty(true) }} /><span className="track" /></span>
          </label>

          <div className="field" style={{ marginTop: 14 }}>
            <label>Send via</label>
            <div className="seg" style={{ width: 'fit-content' }}>
              <button className={channel === 'whatsapp' ? 'on' : ''} onClick={() => { setChannel('whatsapp'); setDirty(true) }}>WhatsApp</button>
              <button className={channel === 'sms' ? 'on' : ''} onClick={() => { setChannel('sms'); setDirty(true) }}>SMS</button>
            </div>
          </div>

          <div className="field" style={{ marginTop: 8 }}><label>Reminder ladder</label></div>
          <div className="col" style={{ gap: 8 }}>
            {rules.map((r) => (
              <div key={r.id} className="rem-rule">
                <span className="switch"><input type="checkbox" checked={r.enabled} onChange={() => setRule(r.id, { enabled: !r.enabled })} /><span className="track" /></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row gap"><span style={{ fontWeight: 600 }}>{r.label}</span>
                    <span className="pill neutral">{r.offset === 0 ? 'on due day' : r.offset < 0 ? `${-r.offset}d before` : `${r.offset}d after`}</span></div>
                  <div className="muted" style={{ fontSize: '0.76rem', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.template}</div>
                </div>
                <button className="btn sm ghost" onClick={() => setEditRule(r)}><IconEdit size={13} /></button>
              </div>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 12 }}>Placeholders: {'{first_name} {amount} {property} {due_date} {days} {manager}'}</p>
        </div>
      )}

      {/* Recently sent */}
      {sentLog.length > 0 && (
        <div className="card">
          <div className="spread" style={{ padding: '16px 18px 12px' }}><h3>Recently sent</h3></div>
          <div className="divider" style={{ margin: 0 }} />
          <div style={{ padding: '6px 8px' }}>
            {sentLog.slice(0, 8).map((l) => (
              <div key={l.id} className="spread list-row" style={{ padding: '11px 12px' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{tenantName(l.tenant_id)}</div>
                  <div className="muted" style={{ fontSize: '0.8rem' }}>{ruleLabel(l.rule_id)} · {l.channel === 'sms' ? 'SMS' : 'WhatsApp'}</div>
                </div>
                <div className="row gap">
                  <span className="mono muted">{money(l.amount)}</span>
                  <span className="pill ok"><IconCheck size={12} /> {timeAgo(l.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editRule && (
        <RuleEditModal rule={editRule}
          onClose={() => setEditRule(null)}
          onSave={(tpl) => { setRule(editRule.id, { template: tpl }); setEditRule(null) }} />
      )}

      <style>{`
        .rem-xrow { display:flex; align-items:center; gap:12px; padding:12px 16px; border-bottom:1px solid var(--line-soft); transition:background 0.13s; }
        .rem-xrow:last-child { border-bottom:none; }
        .rem-xrow:hover { background:var(--accent-bg); }
        .rem-dot { width:9px; height:9px; border-radius:99px; flex-shrink:0; }
        .rem-sub { font-size:0.78rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .rem-menu { position:absolute; right:0; top:calc(100% + 6px); z-index:20; min-width:170px;
          background:var(--surface); border:1px solid var(--line); border-radius:10px;
          box-shadow:0 10px 28px -12px rgba(13,27,46,0.35); padding:5px; }
        .rem-menu button { display:flex; align-items:center; gap:8px; width:100%; padding:9px 11px;
          background:none; border:none; border-radius:7px; color:var(--text); font-size:0.86rem;
          cursor:pointer; text-align:left; }
        .rem-menu button:hover { background:var(--accent-bg); }
        .rem-row { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:12px; border-bottom:1px solid var(--line-soft); }
        .rem-row:last-child { border-bottom:none; }
        .rem-toggle { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:13px 15px; border:1px solid var(--line); border-radius:var(--radius); cursor:pointer; }
        .rem-rule { display:flex; align-items:center; gap:12px; padding:11px 13px; border:1px solid var(--line); border-radius:var(--radius); }
      `}</style>
    </div>
  )
}

function RuleEditModal({ rule, onClose, onSave }) {
  const [tpl, setTpl] = useState(rule.template)
  return (
    <Modal title={`Edit: ${rule.label}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => onSave(tpl)}>Save message</button></>}>
      <div className="field">
        <label>Message</label>
        <textarea className="textarea" style={{ minHeight: 140 }} value={tpl} onChange={(e) => setTpl(e.target.value)} />
      </div>
      <p className="hint">Placeholders are filled per tenant: {'{first_name} {amount} {property} {due_date} {days} {manager}'}</p>
    </Modal>
  )
}
