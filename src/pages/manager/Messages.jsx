import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { db } from '../../lib/db.js'
import { fullName, timeAgo } from '../../lib/format.js'
import { Spinner, CountBadge, EmptyState } from '../../components/ui.jsx'
import MessageThread from '../../components/MessageThread.jsx'
import { IconChevron, IconShield } from '../../components/icons.jsx'

// Conversation list plus the open thread. The other party is a tenant, or —
// for the workspace owner — one of their agents.
export default function ManagerMessages() {
  const { userId, profile } = useAuth()
  const isOwner = profile?.role !== 'staff'

  const [loading, setLoading] = useState(true)
  const [threads, setThreads] = useState([])
  const [tenants, setTenants] = useState([])
  const [team, setTeam] = useState([])
  const [owner, setOwner] = useState(null)   // for an agent: who they report to
  const [open, setOpen] = useState(null)      // { id, kind }
  const [items, setItems] = useState([])

  const loadThreads = useCallback(async () => {
    const [th, ts, tm, own] = await Promise.all([
      db.listMessageThreads(userId),
      db.listTenants(userId),
      // Only an owner has agents to talk to; staff message their owner instead.
      isOwner ? db.listTeam(userId).catch(() => []) : Promise.resolve([]),
      // An agent needs the owner's name to label their own conversation.
      isOwner ? Promise.resolve(null) : db.getWorkspaceManager(userId).catch(() => null),
    ])
    setThreads(th); setTenants(ts); setTeam(tm); setOwner(own)
    setLoading(false)
  }, [userId, isOwner])
  useEffect(() => { loadThreads() }, [loadThreads])

  const openThread = useCallback(async (id, kind) => {
    setOpen({ id, kind })
    setItems(await db.listMessages(userId, id))
    await db.markMessagesRead(userId, id)
    loadThreads()
  }, [userId, loadThreads])

  const refresh = useCallback(async () => {
    if (open) setItems(await db.listMessages(userId, open.id))
    loadThreads()
  }, [userId, open, loadThreads])

  const personOf = (id) => tenants.find((t) => t.id === id) || team.find((s) => s.id === id) || (owner?.id === id ? owner : null)
  const nameOf = (id) => { const p = personOf(id); return p ? fullName(p) : 'Conversation' }
  const isAgent = (id) => team.some((s) => s.id === id) || owner?.id === id

  if (loading) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>

  // Anyone reachable who hasn't written yet — tenants, plus agents for an owner.
  const started = new Set(threads.map((t) => t.party_id))
  const newTenants = tenants.filter((t) => t.account_status === 'active' && !started.has(t.id))
  const newAgents = team.filter((s) => !started.has(s.id))

  const Row = ({ id, sub, unread, preview, when, agent }) => (
    <button className={`msg-row ${open?.id === id ? 'on' : ''}`} onClick={() => openThread(id, agent ? 'staff' : 'tenant')}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="spread" style={{ gap: 8 }}>
          <span className="row gap" style={{ fontWeight: 600, minWidth: 0 }}>
            {agent && <span style={{ color: 'var(--accent)' }} title="Agent"><IconShield size={12} /></span>}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameOf(id)}</span>
          </span>
          {unread > 0 && <CountBadge n={unread} />}
        </div>
        {preview && <div className="muted msg-preview">{preview}</div>}
        {sub && !preview && <div className="muted" style={{ fontSize: '0.76rem' }}>{sub}</div>}
        {when && <div className="muted" style={{ fontSize: '0.7rem', marginTop: 2 }}>{when}</div>}
      </div>
    </button>
  )

  return (
    <div className="page" style={{ maxWidth: 1040 }}>
      <div className="page-head">
        <div className="eyebrow">Messages</div>
        <h1>{isOwner ? 'Messages' : 'Tenant messages'}</h1>
        <p>
          {isOwner
            ? 'Conversations with your tenants and your agents. They get a pop-up on their phone as soon as you reply.'
            : 'Conversations with the tenants you look after, and with the property owner.'}
        </p>
      </div>

      <div className="msg-grid">
        <div className={`card msg-list ${open ? 'hide-sm' : ''}`}>
          {threads.length === 0 && newTenants.length === 0 && newAgents.length === 0 ? (
            <EmptyState icon="💬" title="No conversations yet">Tenants can message you from their app.</EmptyState>
          ) : (
            <>
              {threads.map((th) => (
                <Row key={th.party_id} id={th.party_id} unread={th.unread} agent={th.kind === 'staff'}
                  preview={`${th.last.sender_role === 'manager' ? 'You: ' : ''}${th.last.deleted_at ? 'Message deleted' : th.last.body}`}
                  when={timeAgo(th.last.created_at)} />
              ))}

              {!isOwner && (
                <div className="msg-start">
                  <div className="msg-start-head">Property owner</div>
                  <Row id={owner?.id || profile?.owner_id} sub="Message the owner" agent />
                </div>
              )}

              {(newTenants.length > 0 || newAgents.length > 0) && (
                <div className="msg-start">
                  <div className="msg-start-head">Start a conversation</div>
                  {newAgents.map((s) => <Row key={s.id} id={s.id} sub="Agent" agent />)}
                  {newTenants.map((t) => <Row key={t.id} id={t.id} sub={t.unit || '—'} />)}
                </div>
              )}
            </>
          )}
        </div>

        <div className={open ? '' : 'hide-sm'} style={{ minWidth: 0 }}>
          {!open ? (
            <div className="card msg-card"><div className="center" style={{ flex: 1 }}><span className="muted">Pick a conversation.</span></div></div>
          ) : (
            <MessageThread
              items={items}
              myId={userId}
              placeholder="Write a reply…"
              header={(
                <div className="msg-head">
                  <button className="btn sm ghost back-sm" onClick={() => setOpen(null)}>
                    <IconChevron size={14} style={{ transform: 'rotate(90deg)' }} /> Back
                  </button>
                  <b>{nameOf(open.id)}</b>
                  <span className="muted" style={{ fontSize: '0.78rem' }}>
                    {isAgent(open.id) ? 'Agent' : personOf(open.id)?.unit || ''}
                  </span>
                </div>
              )}
              empty={<div className="center" style={{ flex: 1 }}><span className="muted">No messages yet — say hello.</span></div>}
              onSend={async (body) => { await db.sendMessage(userId, { partyId: open.id, body }); await refresh() }}
              onEdit={async (id, body) => { await db.editMessage(userId, id, body); await refresh() }}
              onDelete={async (id) => { await db.deleteMessage(userId, id); await refresh() }}
            />
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
        .msg-start-head { padding: 10px 12px 6px; font-size: 0.74rem; color: var(--text-faint);
          text-transform: uppercase; letter-spacing: .05em; }
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
