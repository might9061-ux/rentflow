import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const nav = useNavigate()

  const [loading, setLoading] = useState(true)
  const [menuFor, setMenuFor] = useState(null) // party id whose ⋯ menu is open
  const [threads, setThreads] = useState([])
  const [tenants, setTenants] = useState([])
  const [team, setTeam] = useState([])
  const [owner, setOwner] = useState(null)   // for an agent: who they report to
  const [open, setOpen] = useState(null)      // { id, kind }
  const [items, setItems] = useState([])

  useEffect(() => {
    if (!menuFor) return
    const close = () => setMenuFor(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuFor])

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

  const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?'

  // Executive row: initials avatar (role-tinted), name · role inline, one-line
  // preview, right-aligned time + unread badge. Tenants get a ⋯ menu.
  const Row = ({ id, unread, preview, when, agent, roleLabel, fresh }) => {
    const p = personOf(id)
    const name = nameOf(id)
    const go = () => openThread(id, agent ? 'staff' : 'tenant')
    return (
      <div className={`msgx-row ${open?.id === id ? 'on' : ''}`} role="button" tabIndex={0}
        onClick={go} onKeyDown={(e) => { if (e.key === 'Enter') go() }}>
        <span className={`msgx-ava ${agent ? 'agent' : ''}`}>
          {agent ? <IconShield size={15} /> : initials(name)}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="msgx-name">
            {name} <span className="muted" style={{ fontWeight: 400 }}>· {roleLabel || (agent ? 'Agent' : p?.unit || 'Tenant')}</span>
          </div>
          <div className="muted msg-preview">{preview || 'No messages yet'}</div>
        </div>
        <div className="msgx-side">
          {when && <span className="msgx-when">{when}</span>}
          {unread > 0 ? <CountBadge n={unread} /> : fresh ? <span className="msgx-go">Message</span> : null}
        </div>
        {!agent && !fresh && p && (
          <span style={{ position: 'relative' }}>
            <button className="btn sm ghost" title="More" aria-label="More actions"
              onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === id ? null : id) }}>⋯</button>
            {menuFor === id && (
              <div className="msgx-menu" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => nav(`/manager/tenants/${id}`)}>View tenant</button>
              </div>
            )}
          </span>
        )}
      </div>
    )
  }

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
                  <Row id={owner?.id || profile?.owner_id} roleLabel="Owner" agent fresh />
                </div>
              )}

              {(newTenants.length > 0 || newAgents.length > 0) && (
                <div className="msg-start">
                  <div className="msg-start-head">Start a conversation</div>
                  {newAgents.map((s) => <Row key={s.id} id={s.id} agent fresh />)}
                  {newTenants.map((t) => <Row key={t.id} id={t.id} fresh />)}
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
        .msg-grid { display: grid; grid-template-columns: 330px 1fr; gap: 16px; align-items: start; }
        .msg-list { max-height: min(620px, calc(100vh - 260px)); overflow-y: auto; padding: 0; }
        .msgx-row { position: relative; display: flex; align-items: center; gap: 11px; padding: 12px 14px;
          border-bottom: 1px solid var(--line-soft); cursor: pointer; transition: background 0.13s; color: var(--text); }
        .msgx-row:last-child { border-bottom: none; }
        .msgx-row:hover { background: var(--accent-bg); }
        .msgx-row:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--accent); }
        .msgx-row.on { background: var(--accent-bg); box-shadow: inset 2px 0 0 var(--accent); }
        .msgx-ava { width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center;
          justify-content: center; background: var(--accent-bg); color: var(--accent); font-weight: 700;
          font-size: 0.76rem; letter-spacing: 0.02em; }
        .msgx-ava.agent { background: var(--green-bg); color: var(--green); }
        .msgx-name { font-weight: 600; font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .msgx-side { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
        .msgx-when { font-size: 0.68rem; color: var(--text-faint); }
        .msgx-go { font-size: 0.72rem; color: var(--accent); border: 1px solid var(--accent-line);
          border-radius: 99px; padding: 2px 10px; white-space: nowrap; }
        .msgx-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; min-width: 150px;
          background: var(--surface); border: 1px solid var(--line); border-radius: 10px;
          box-shadow: 0 10px 28px -12px rgba(13,27,46,0.35); padding: 5px; }
        .msgx-menu button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 11px;
          background: none; border: none; border-radius: 7px; color: var(--text); font-size: 0.86rem;
          cursor: pointer; text-align: left; }
        .msgx-menu button:hover { background: var(--accent-bg); }
        .msg-preview { font-size: 0.78rem; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .msg-start { border-top: 1px solid var(--line-soft); }
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
