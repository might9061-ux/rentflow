import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { db } from '../lib/db.js'
import { askAssistant, isLiveAI } from '../lib/ai.js'
import { groupsFor } from '../lib/copilotPrompts.js'
import { acceptedMethods } from '../lib/methods.js'
import { currentPeriod } from '../lib/billing.js'
import { fullName, timeAgo } from '../lib/format.js'
import { CountBadge } from './ui.jsx'
import { IconSparkle, IconSend, IconX, IconBell } from './icons.jsx'

// Floating AI copilot. role = 'manager' | 'tenant'.
export default function AssistantWidget({ role }) {
  const { userId, profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('chat') // chat | inbox (manager only)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [ctx, setCtx] = useState(null)
  const [questions, setQuestions] = useState([])
  const [unread, setUnread] = useState(0)
  const [openGroup, setOpenGroup] = useState(null)
  const bodyRef = useRef(null)
  const navigate = useNavigate()
  const groups = groupsFor(role)

  const greeting = role === 'manager'
    ? `Hi ${profile?.first_name || ''} — ask me about outstanding rent, approvals, occupancy or how to do anything in RentLoja.`
    : `Hi ${profile?.first_name || ''} — ask me about your rent, balance, how to pay, credit or receipts.`

  // Build grounded context for the assistant.
  // Returns the built context so callers can use it immediately — setCtx is
  // async, so relying on the ctx state right after calling this gives the stale
  // (null) value.
  const loadContext = useCallback(async () => {
    let built
    if (role === 'manager') {
      const [tenants, properties, payments] = await Promise.all([
        db.listTenants(userId), db.listProperties(userId), db.listPayments(userId),
      ])
      built = { profile, tenants, properties, payments }
    } else {
      const [payments, manager] = await Promise.all([
        db.listTenantPayments(userId), db.getTenantManager(userId),
      ])
      built = {
        profile, payments, manager,
        accepted: acceptedMethods(manager),
        payDetails: manager?.payment_details || {},
        period: currentPeriod(profile?.due_day || 1),
        notify: !!manager?.notify_on_tenant_ai,
      }
    }
    setCtx(built)
    return built
  }, [role, userId, profile])

  const refreshUnread = useCallback(async () => {
    if (role !== 'manager') return
    setUnread(await db.tenantQuestionsUnread(userId))
  }, [role, userId])

  useEffect(() => { refreshUnread() }, [refreshUnread])
  useEffect(() => {
    if (open && !ctx) loadContext()
    if (open) setMessages((m) => m.length ? m : [{ role: 'assistant', text: greeting }])
  }, [open, ctx, loadContext, greeting])
  useEffect(() => { bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight) }, [messages, busy])

  // Hand the last thing the tenant asked to a human, pre-filled so they don't
  // have to type it twice. The Copilot's own reply stays out of it — the
  // manager wants the question, not a transcript.
  const escalate = () => {
    const lastAsked = [...messages].reverse().find((m) => m.role === 'user')?.text || input.trim()
    setOpen(false)
    navigate(`/tenant/messages${lastAsked ? `?q=${encodeURIComponent(lastAsked)}` : ''}`)
  }

  const ask = (text) => { setOpenGroup(null); send(null, text) }

  const send = async (e, preset) => {
    e?.preventDefault()
    const text = (preset ?? input).trim()
    if (!text || busy) return
    if (!preset) setInput('')
    setMessages((m) => [...m, { role: 'user', text }])
    setBusy(true)
    try {
      const context = ctx || (await loadContext())
      const reply = await askAssistant({ role, message: text, context, history: messages })
      setMessages((m) => [...m, { role: 'assistant', text: reply }])
      // Notify the manager of tenant questions when they've opted in.
      if (role === 'tenant' && ctx?.notify && ctx?.manager) {
        db.logTenantQuestion(ctx.manager.id, userId, { question: text, answer: reply })
      }
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', text: `Sorry — I hit an error: ${err.message}` }])
    } finally { setBusy(false) }
  }

  const openInbox = async () => {
    setTab('inbox')
    setQuestions(await db.listTenantQuestions(userId))
    await db.markTenantQuestionsRead(userId)
    refreshUnread()
  }

  const tenantName = (id, q) => {
    const t = ctx?.tenants?.find((x) => x.id === id)
    return t ? fullName(t) : 'A tenant'
  }

  return (
    <>
      <button className="ai-fab" onClick={() => setOpen((o) => !o)} aria-label="AI assistant">
        {open ? <IconX size={20} /> : <IconSparkle size={20} />}
        {!open && unread > 0 && <span className="ai-fab-badge"><CountBadge n={unread} /></span>}
      </button>

      {open && (
        <div className="ai-panel">
          <div className="ai-head">
            <div className="row gap">
              <span className="ai-dot"><IconSparkle size={15} /></span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>RentLoja Copilot</div>
                <div className="muted" style={{ fontSize: '0.72rem' }}>{isLiveAI ? 'Powered by Claude' : (role === 'manager' ? 'Manager copilot' : 'Here to help')}</div>
              </div>
            </div>
            <button className="x-btn" onClick={() => setOpen(false)}><IconX size={15} /></button>
          </div>

          {role === 'manager' && (
            <div className="ai-tabs">
              <button className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>Chat</button>
              <button className={tab === 'inbox' ? 'on' : ''} onClick={openInbox}>
                Tenant questions {unread > 0 && <CountBadge n={unread} />}
              </button>
            </div>
          )}

          {tab === 'chat' ? (
            <>
              <div className="ai-body" ref={bodyRef}>
                {messages.map((m, i) => (
                  <div key={i} className={`ai-msg ${m.role}`}>{m.text}</div>
                ))}
                {busy && <div className="ai-msg assistant ai-typing"><span /><span /><span /></div>}

                {/* Grouped starters, kept visible for the whole conversation:
                    they're the honest advertisement of what the Copilot actually
                    knows, so people aren't guessing at a blank box. Tapping a
                    group swaps the chips for that group's questions. */}
                {!busy && (
                  <div className="ai-sugs">
                    {openGroup ? (
                      <>
                        <button className="ai-sug-back" onClick={() => setOpenGroup(null)}>← {openGroup.icon} {openGroup.label}</button>
                        {openGroup.questions.map((q) => (
                          <button key={q} className="ai-sug" onClick={() => ask(q)}>{q}</button>
                        ))}
                      </>
                    ) : (
                      groups.map((g) => (
                        <button key={g.id} className="ai-sug group" onClick={() => setOpenGroup(g)}>
                          <span>{g.icon}</span> {g.label}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* When the Copilot can't help, a human can. */}
              {role === 'tenant' && (
                <button className="ai-escalate" onClick={escalate}>
                  <IconSend size={12} /> Didn’t answer your question? Message your manager
                </button>
              )}

              <form className="ai-input" onSubmit={send}>
                <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything…" autoFocus />
                <button type="submit" disabled={busy || !input.trim()} aria-label="Send"><IconSend size={16} /></button>
              </form>
            </>
          ) : (
            <div className="ai-body">
              {questions.length === 0 ? (
                <div className="empty-state" style={{ padding: 30 }}>
                  <div className="es-ico"><IconBell size={26} /></div>
                  <span className="muted">No tenant questions yet.{!ctx ? '' : ''}</span>
                </div>
              ) : questions.map((qq) => (
                <div key={qq.id} className="ai-q">
                  <div className="spread">
                    <b style={{ fontSize: '0.85rem' }}>{tenantName(qq.tenant_id)}</b>
                    <span className="muted" style={{ fontSize: '0.72rem' }}>{timeAgo(qq.created_at)}</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', marginTop: 3 }}>“{qq.question}”</div>
                  {qq.answer && <div className="muted" style={{ fontSize: '0.78rem', marginTop: 4 }}>Assistant replied: {qq.answer.slice(0, 120)}{qq.answer.length > 120 ? '…' : ''}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        .ai-fab { position: fixed; right: 22px; bottom: 22px; width: 54px; height: 54px; border-radius: 99px; z-index: 80;
          background: linear-gradient(180deg, var(--accent-soft), var(--accent)); color: #14110b; border: none;
          box-shadow: 0 12px 30px -10px var(--accent); display: grid; place-items: center; transition: transform .15s; }
        .ai-fab:hover { transform: translateY(-2px); }
        .ai-fab-badge { position: absolute; top: -3px; right: -3px; }
        .ai-panel { position: fixed; right: 22px; bottom: 86px; width: 370px; max-width: calc(100vw - 32px); height: 540px; max-height: calc(100vh - 120px);
          background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); box-shadow: var(--shadow);
          z-index: 80; display: flex; flex-direction: column; overflow: hidden; animation: pop .18s ease; }
        .ai-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--line-soft); }
        .ai-dot { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; background: var(--accent-bg); border: 1px solid var(--accent-line); color: var(--accent); }
        .ai-tabs { display: flex; gap: 4px; padding: 8px 12px 0; }
        .ai-tabs button { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: transparent; border: none; color: var(--text-dim);
          font-size: 0.82rem; font-weight: 500; padding: 8px; border-radius: 8px 8px 0 0; border-bottom: 2px solid transparent; }
        .ai-tabs button.on { color: var(--accent-soft); border-bottom-color: var(--accent); }
        .ai-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
        .ai-msg { max-width: 85%; padding: 10px 13px; border-radius: 14px; font-size: 0.86rem; line-height: 1.5; white-space: pre-wrap; }
        .ai-msg.assistant { align-self: flex-start; background: var(--surface-2); border: 1px solid var(--line); border-bottom-left-radius: 4px; }
        .ai-msg.user { align-self: flex-end; background: var(--accent-bg); border: 1px solid var(--accent-line); color: var(--text); border-bottom-right-radius: 4px; }
        .ai-typing { display: flex; gap: 4px; }
        .ai-typing span { width: 6px; height: 6px; border-radius: 99px; background: var(--text-faint); animation: blink 1s infinite both; }
        .ai-typing span:nth-child(2) { animation-delay: .2s; } .ai-typing span:nth-child(3) { animation-delay: .4s; }
        @keyframes blink { 0%,80%,100% { opacity: .25; } 40% { opacity: 1; } }
        .ai-input { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--line-soft); }
        .ai-input input { flex: 1; background: var(--bg); border: 1px solid var(--line); border-radius: 99px; padding: 10px 15px; color: var(--text); font-size: 0.88rem; }
        .ai-input input:focus { outline: none; border-color: var(--accent-line); box-shadow: 0 0 0 3px var(--accent-bg); }
        .ai-input button { width: 40px; height: 40px; border-radius: 99px; border: none; background: linear-gradient(180deg, var(--accent-soft), var(--accent)); color: #14110b; display: grid; place-items: center; }
        .ai-input button:disabled { opacity: .5; }
        .ai-q { padding: 11px 12px; border: 1px solid var(--line-soft); border-radius: 11px; background: var(--bg); }
        .ai-sugs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
        .ai-sug { background: var(--bg); border: 1px solid var(--line); color: var(--text-dim); border-radius: 99px;
          padding: 7px 12px; font-size: 0.78rem; text-align: left; line-height: 1.35; }
        .ai-sug:hover { border-color: var(--accent-line); color: var(--text); background: var(--accent-bg); }
        .ai-sug.group { display: inline-flex; align-items: center; gap: 6px; font-weight: 500; }
        .ai-sug-back { background: transparent; border: none; color: var(--accent-soft); font-size: 0.78rem;
          font-weight: 600; padding: 4px 2px; width: 100%; text-align: left; }
        .ai-escalate { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%;
          background: transparent; border: none; border-top: 1px solid var(--line-soft); color: var(--text-dim);
          font-size: 0.76rem; padding: 10px 12px; }
        .ai-escalate:hover { color: var(--accent-soft); background: var(--accent-bg); }
      `}</style>
    </>
  )
}
