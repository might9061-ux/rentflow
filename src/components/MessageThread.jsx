// One conversation, shared by the tenant, agent and manager views so all three
// behave identically.
//
// Two things beyond a plain list:
//   • Session dividers — a run of messages with no gap longer than a day is one
//     "session". A new one starts a labelled line, so a conversation that
//     resumes after a week doesn't read as if it happened in one sitting.
//   • Edit / delete on your own messages, WhatsApp-style. A deleted message
//     leaves a tombstone rather than vanishing: these conversations can end up
//     being the evidence in a rent dispute, and either side being able to erase
//     their own words without trace would be worse than not having delete.
import { useState, useRef, useEffect } from 'react'
import { useToast } from '../context/ToastContext.jsx'
import { IconSend, IconSparkle, IconEdit, IconTrash, IconX, IconCheck } from './icons.jsx'

const DAY_MS = 24 * 60 * 60 * 1000
const EDIT_WINDOW_MS = 15 * 60 * 1000

function sessionLabel(d) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const days = Math.round((today - that) / DAY_MS)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' })
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: days > 300 ? 'numeric' : undefined })
}

// A session ends when nothing is said for a day.
function withSessions(items) {
  const out = []
  let prev = null
  for (const m of items) {
    const at = new Date(m.created_at)
    if (!prev || at - prev > DAY_MS) out.push({ divider: true, id: `d-${m.id}`, label: sessionLabel(at) })
    out.push(m)
    prev = at
  }
  return out
}

export default function MessageThread({
  items, myId, onSend, onEdit, onDelete, initialText = '',
  placeholder = 'Write a message…', header = null, empty = null,
}) {
  const toast = useToast()
  const [text, setText] = useState(initialText)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(null)   // message id
  const [editText, setEditText] = useState('')
  const [menuFor, setMenuFor] = useState(null)
  const bodyRef = useRef(null)

  useEffect(() => { bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight) }, [items])
  // Any click outside closes an open message menu.
  useEffect(() => {
    if (!menuFor) return
    const close = () => setMenuFor(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuFor])

  const send = async (e) => {
    e?.preventDefault()
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    try { await onSend(body); setText('') }
    catch (err) { toast.error('Could not send', err.message) }
    finally { setBusy(false) }
  }

  const saveEdit = async (id) => {
    const body = editText.trim()
    if (!body) return
    setBusy(true)
    try { await onEdit(id, body); setEditing(null) }
    catch (err) { toast.error('Could not edit', err.message) }
    finally { setBusy(false) }
  }

  const remove = async (id) => {
    setMenuFor(null)
    setBusy(true)
    try { await onDelete(id) }
    catch (err) { toast.error('Could not delete', err.message) }
    finally { setBusy(false) }
  }

  const rows = withSessions(items)

  return (
    <div className="card msg-card">
      {header}
      <div className="msg-body" ref={bodyRef}>
        {items.length === 0 ? (empty || <div className="center" style={{ flex: 1 }}><span className="muted">No messages yet.</span></div>)
          : rows.map((m) => {
            if (m.divider) return <div key={m.id} className="msg-divider"><span>{m.label}</span></div>

            const mine = m.sender_id === myId
            const deleted = !!m.deleted_at
            const canEdit = mine && !deleted && Date.now() - new Date(m.created_at).getTime() < EDIT_WINDOW_MS

            if (editing === m.id) {
              return (
                <div key={m.id} className={`msg ${mine ? 'mine' : 'theirs'}`}>
                  <textarea className="msg-edit" value={editText} rows={2}
                    onChange={(e) => setEditText(e.target.value)} autoFocus />
                  <div className="row gap" style={{ justifyContent: 'flex-end', marginTop: 6 }}>
                    <button className="btn sm ghost" onClick={() => setEditing(null)}><IconX size={12} /> Cancel</button>
                    <button className="btn sm primary" disabled={busy} onClick={() => saveEdit(m.id)}><IconCheck size={12} /> Save</button>
                  </div>
                </div>
              )
            }

            return (
              <div key={m.id} className={`msg ${mine ? 'mine' : 'theirs'} ${deleted ? 'gone' : ''}`}>
                {m.from_assistant && !deleted && (
                  <div className="msg-tag"><IconSparkle size={11} /> {mine ? 'Asked the Copilot first' : 'Copilot couldn’t answer this'}</div>
                )}
                <div className="msg-text">{deleted ? 'This message was deleted' : m.body}</div>
                <div className="msg-time">
                  {new Date(m.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  {m.edited_at && !deleted && <span> · edited</span>}
                </div>

                {mine && !deleted && (
                  <button className="msg-more" aria-label="Message options"
                    onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === m.id ? null : m.id) }}>⋯</button>
                )}
                {menuFor === m.id && (
                  <div className="msg-menu" onClick={(e) => e.stopPropagation()}>
                    {canEdit ? (
                      <button onClick={() => { setEditing(m.id); setEditText(m.body); setMenuFor(null) }}>
                        <IconEdit size={13} /> Edit
                      </button>
                    ) : (
                      <span className="msg-menu-note">Editing closes 15 min after sending</span>
                    )}
                    <button className="danger" onClick={() => remove(m.id)}><IconTrash size={13} /> Delete for everyone</button>
                  </div>
                )}
              </div>
            )
          })}
      </div>

      <form className="msg-input" onSubmit={send}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} rows={1}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
        <button type="submit" disabled={busy || !text.trim()} aria-label="Send"><IconSend size={16} /></button>
      </form>
    </div>
  )
}
