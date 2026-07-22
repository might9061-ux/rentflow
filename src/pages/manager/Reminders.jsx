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
import { StatCard, Spinner, EmptyState } from '../../components/ui.jsx'
import Modal from '../../components/Modal.jsx'
import { IconClock, IconWhatsapp, IconSend, IconCheck, IconEdit, IconBell, IconX } from '../../components/icons.jsx'

const KIND_PILL = { upcoming: 'neutral', due: 'gold', overdue: 'overdue' }

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

  const load = useCallback(async () => {
    const [m, t, p, pr, lg] = await Promise.all([
      db.getWorkspaceManager(userId), db.listTenants(userId), db.listPayments(userId),
      db.listProperties(userId), db.listReminderLog(userId),
    ])
    setWm(m); setTenants(t); setPayments(p); setProperties(pr); setLog(lg)
    setEnabled(remindersEnabled(m)); setChannel(reminderChannel(m)); setRules(reminderRules(m))
    setDirty(false); setLoading(false)
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

      <div className="grid stats" style={{ marginBottom: 22 }}>
        <StatCard label="Due to send now" value={due.length} sub={enabled ? 'Ready to go out' : 'Reminders are off'} icon={<IconClock size={18} />} />
        <StatCard label="Sent" value={sentLog.length} sub="All time" icon={<IconSend size={18} />} />
        <StatCard label="Channel" value={channel === 'sms' ? 'SMS' : 'WhatsApp'} sub="Delivery method" icon={<IconWhatsapp size={18} />} />
      </div>

      {/* Due queue */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="spread" style={{ padding: '16px 18px 12px' }}>
          <div>
            <h3>Due to send {due.length > 0 && <span className="seg-count" style={{ position: 'static' }}>{due.length}</span>}</h3>
            <p className="muted" style={{ fontSize: '0.82rem', marginTop: 2 }}>One reminder per tenant — the current stage they’ve reached.</p>
          </div>
          {due.length > 0 && <button className="btn primary" onClick={sendAll}><IconSend size={15} /> Send all</button>}
        </div>
        <div className="divider" style={{ margin: 0 }} />
        {!enabled ? (
          <EmptyState icon="🔕" title="Reminders are turned off">Turn them on below to start queuing reminders.</EmptyState>
        ) : due.length === 0 ? (
          <EmptyState icon="✅" title="Nothing due right now">Everyone’s either paid or already reminded this stage.</EmptyState>
        ) : (
          <div style={{ padding: '6px 8px' }}>
            {due.map((item) => (
              <div key={item.tenant.id} className="rem-row">
                <div style={{ minWidth: 0 }}>
                  <div className="row gap" style={{ flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600 }}>{fullName(item.tenant)}</span>
                    <span className={`pill ${KIND_PILL[item.rule.kind] || 'neutral'}`}>{item.rule.label}</span>
                  </div>
                  <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>
                    {prettyPhone(item.tenant.phone)} · {money(item.amount)} outstanding{item.daysOverdue > 0 ? ` · ${item.daysOverdue} days overdue` : ''}
                  </div>
                </div>
                <div className="row gap" style={{ flexShrink: 0 }}>
                  <button className="btn sm ghost" title="Skip this month" onClick={() => skip(item)}>Skip</button>
                  <button className="btn sm ghost" title="Mute this tenant" onClick={() => mute(item)}>Mute</button>
                  <button className={`btn sm ${channel === 'whatsapp' ? 'wa' : 'primary'}`} onClick={() => sendOne(item)}>
                    {channel === 'whatsapp' ? <IconWhatsapp size={14} /> : <IconSend size={14} />} Send
                  </button>
                </div>
              </div>
            ))}
          </div>
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
