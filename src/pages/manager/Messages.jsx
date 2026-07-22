import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { fullName, timeAgo } from '../../lib/format.js'
import { Spinner, CountBadge, EmptyState } from '../../components/ui.jsx'
import { IconSend, IconSparkle, IconChevron } from '../../components/icons.jsx'

// Manager side: a list of tenant conversations, and the open one beside it.
export default function ManagerMessages() {
  const { userId } = useAuth()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [threads, setThreads] = useState([])
  const [tenants, setTenants] = useState([])
  const [openId, setOpenId] = useState(null)
  const [items, setItems] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const bodyRef = useRef(null)

  const loadThreads = useCallback(async () => {
    const [th, ts] = await Promise.all([db.listMessageThreads(userId), db.listTenants(userId)])
    setThreads(th); setTenants(ts); setLoading(false)
  }, [userId])
  useEffect(() => { loadThreads() }, [loadThreads])

  const openThread = useCallback(async (tenantId) => {
    setOpenId(tenantId)
    setItems(await db.listMessages(userId, tenantId))
    await db.markMessagesRead(userId, tenantId)
    loadThreads()
  }, [userId, loadThreads])

  useEffect(() => { bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight) }, [items])

  const tenantOf = (id) => tenants.find((t) => t.id === id)
  const nameOf = (id) => { const t = tenantOf(id); return t ? fullName(t) : 'Tenant' }

  const send = async (e) => {
    e?.preventDefault()
    const body = text.trim()
    if (!body || busy || !openId) return
    setBusy(true)
    try {
      await db.sendMessage(userId, { tenantId: openId, body })
      setText('')
      setItems(await db.listMessages(userId, openId))
      loadThreads()
    } catch (err) { toast.error('Could not send', err.message) }
    finally { setBusy(false) }
  }

  // Anyone with an active tenancy can be messaged, not just those who wrote first.
  const startable = tenants.filter((t) => t.account_status === 'active' && !threads.some((th) => th.tenant_id === t.id))

  if (loading) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>

  return (
    <div className="page" style={{ maxWidth: 1040 }}>
      <div className="page-head">
        <div className="eyebrow">Messages</div>
        <h1>Tenant messages</h1>
        <p>Direct conversations with your tenants. They get a pop-up on their phone as soon as you reply.</p>
      </div>

      <div className="msg-grid">
        {/* Conversation list */}
        <div className={`card msg-list ${openId ? 'hide-sm' : ''}`}>
          {threads.length === 0 && startable.length === 0 ? (
            <EmptyState icon="💬" title="No conversations yet">Tenants can message you from their app.</EmptyState>
          ) : (
            <>
              {threads.map((th) => (
                <button key={th.tenant_id} className={`msg-row ${openId === th.tenant_id ? 'on' : ''}`} onClick={() => openThread(th.tenant_id)}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="spread" style={{ gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{nameOf(th.tenant_id)}</span>
                      {th.unread > 0 && <CountBadge n={th.unread} />}
                    </div>
                    <div className="muted msg-preview">
                      {th.last.sender_role === 'manager' ? 'You: ' : ''}{th.last.body}
                    </div>
                    <div className="muted" style={{ fontSize: '0.7rem', marginTop: 2 }}>{timeAgo(th.last.created_at)}</div>
                  </div>
                </button>
              ))}
              {startable.length > 0 && (
                <div className="msg-start">
                  <div className="muted" style={{ fontSize: '0.74rem', padding: '10px 12px 6px', textTransform: 'uppercase', letterSpacing: '.05em' }}>Start a conversation</div>
                  {startable.map((t) => (
                    <button key={t.id} className="msg-row" onClick={() => openThread(t.id)}>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: 600 }}>{fullName(t)}</span>
                        <div className="muted" style={{ fontSize: '0.76rem' }}>{t.unit || '—'}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Open conversation */}
        <div className={`card msg-card ${openId ? '' : 'hide-sm'}`}>
          {!openId ? (
            <div className="center" style={{ flex: 1 }}>
              <span className="muted">Pick a conversation.</span>
            </div>
          ) : (
            <>
              <div className="msg-head">
                <button className="btn sm ghost back-sm" onClick={() => setOpenId(null)}>
                  <IconChevron size={14} style={{ transform: 'rotate(90deg)' }} /> Back
                </button>
                <b>{nameOf(openId)}</b>
                <span className="muted" style={{ fontSize: '0.78rem' }}>{tenantOf(openId)?.unit || ''}</span>
              </div>
              <div className="msg-body" ref={bodyRef}>
                {items.length === 0
                  ? <div className="center" style={{ flex: 1 }}><span className="muted">No messages yet — say hello.</span></div>
                  : items.map((m) => (
                    <div key={m.id} className={`msg ${m.sender_role === 'manager' ? 'mine' : 'theirs'}`}>
                      {m.from_assistant && <div className="msg-tag"><IconSparkle size={11} /> Copilot couldn’t answer this</div>}
                      <div className="msg-text">{m.body}</div>
                      <div className="msg-time">{timeAgo(m.created_at)}</div>
                    </div>
                  ))}
              </div>
              <form className="msg-input" onSubmit={send}>
                <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply…" rows={1}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
                <button type="submit" disabled={busy || !text.trim()} aria-label="Send"><IconSend size={16} /></button>
              </form>
            </>
          )}
        </div>
      </div>

      <style>{`
        .msg-grid { display: grid; grid-template-columns: 300px 1fr; gap: 16px; align-items: start; }
        .msg-list { max-height: min(620px, calc(100vh - 260px)); overflow-y: auto; padding: 6px; }
        .msg-row { display: flex; width: 100%; text-align: left; gap: 10px; padding: 11px 12px; background: transparent;
          border: none; border-radius: 10px; color: var(--text); }
        .msg-row:hover { background: var(--surface-2); }
        .msg-row.on { background: var(--accent-bg); border: 1px solid var(--accent-line); }
        .msg-preview { font-size: 0.78rem; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .msg-start { border-top: 1px solid var(--line-soft); margin-top: 6px; }
        .msg-head { display: flex; align-items: center; gap: 10px; padding: 13px 16px; border-bottom: 1px solid var(--line-soft); }
        .back-sm { display: none; }
        @media (max-width: 820px) {
          .msg-grid { grid-template-columns: 1fr; }
          .hide-sm { display: none; }
          .back-sm { display: inline-flex; }
        }
      `}</style>
    </div>
  )
}
