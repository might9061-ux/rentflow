import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { db } from '../../lib/db.js'
import { fullName } from '../../lib/format.js'
import { Spinner } from '../../components/ui.jsx'
import MessageThread from '../../components/MessageThread.jsx'

// A tenant's single conversation with their property manager.
export default function TenantMessages() {
  const { userId } = useAuth()
  const [params, setParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [manager, setManager] = useState(null)
  // Arriving from the Copilot's "ask a person" button carries the question
  // across, so the tenant doesn't type it out a second time.
  const [pending] = useState(params.get('q') || '')

  const load = useCallback(async () => {
    const [list, m] = await Promise.all([db.listMessages(userId), db.getTenantManager(userId)])
    setItems(list); setManager(m)
    await db.markMessagesRead(userId)
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])
  // Drop the ?q= once consumed so a refresh doesn't re-fill it.
  useEffect(() => { if (params.get('q')) setParams({}, { replace: true }) }, [params, setParams])

  if (loading) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>

  return (
    <div className="page" style={{ maxWidth: 780 }}>
      <div className="page-head">
        <div className="eyebrow">Messages</div>
        <h1>Your property manager</h1>
        <p>{manager ? `Talk directly to ${fullName(manager)}.` : 'Talk directly to your property manager.'} They’ll get a notification straight away.</p>
      </div>

      <MessageThread
        items={items}
        myId={userId}
        initialText={pending}
        placeholder="Write a message…"
        empty={(
          <div className="empty-state" style={{ padding: 40 }}>
            <div className="es-ico">💬</div>
            <span className="muted">No messages yet. Ask anything — rent, repairs, or your account.</span>
          </div>
        )}
        onSend={async (body) => { await db.sendMessage(userId, { body, fromAssistant: !!pending }); await load() }}
        onEdit={async (id, body) => { await db.editMessage(userId, id, body); await load() }}
        onDelete={async (id) => { await db.deleteMessage(userId, id); await load() }}
      />
    </div>
  )
}
