import { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { fullName, timeAgo } from '../../lib/format.js'
import { Spinner } from '../../components/ui.jsx'
import { IconSend, IconSparkle } from '../../components/icons.jsx'

// A tenant's single conversation with their property manager.
export default function TenantMessages() {
  const { userId } = useAuth()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [manager, setManager] = useState(null)
  // Arriving from the Copilot's "ask a person" button pre-fills the question,
  // so the tenant doesn't have to type it out a second time.
  const [text, setText] = useState(params.get('q') || '')
  const [fromAssistant] = useState(!!params.get('q'))
  const [busy, setBusy] = useState(false)
  const bodyRef = useRef(null)

  const load = useCallback(async () => {
    const [list, m] = await Promise.all([db.listMessages(userId), db.getTenantManager(userId)])
    setItems(list); setManager(m)
    await db.markMessagesRead(userId)
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])
  // Drop the ?q= once consumed so a refresh doesn't re-fill it.
  useEffect(() => { if (params.get('q')) setParams({}, { replace: true }) }, [params, setParams])
  useEffect(() => { bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight) }, [items, loading])

  const send = async (e) => {
    e?.preventDefault()
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    try {
      await db.sendMessage(userId, { tenantId: userId, body, fromAssistant })
      setText('')
      await load()
    } catch (err) { toast.error('Could not send', err.message) }
    finally { setBusy(false) }
  }

  if (loading) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>

  return (
    <div className="page" style={{ maxWidth: 780 }}>
      <div className="page-head">
        <div className="eyebrow">Messages</div>
        <h1>Your property manager</h1>
        <p>{manager ? `Talk directly to ${fullName(manager)}.` : 'Talk directly to your property manager.'} They’ll get a notification straight away.</p>
      </div>

      <div className="card msg-card">
        <div className="msg-body" ref={bodyRef}>
          {items.length === 0 ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <div className="es-ico">💬</div>
              <span className="muted">No messages yet. Ask anything — rent, repairs, or your account.</span>
            </div>
          ) : items.map((m) => (
            <div key={m.id} className={`msg ${m.sender_role === 'tenant' ? 'mine' : 'theirs'}`}>
              {m.from_assistant && (
                <div className="msg-tag"><IconSparkle size={11} /> Asked the Copilot first</div>
              )}
              <div className="msg-text">{m.body}</div>
              <div className="msg-time">{timeAgo(m.created_at)}</div>
            </div>
          ))}
        </div>

        <form className="msg-input" onSubmit={send}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a message…"
            rows={1}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          />
          <button type="submit" disabled={busy || !text.trim()} aria-label="Send"><IconSend size={16} /></button>
        </form>
      </div>

    </div>
  )
}

