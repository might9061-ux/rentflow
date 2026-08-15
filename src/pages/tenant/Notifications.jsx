import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { db } from '../../lib/db.js'
import { timeAgo } from '../../lib/format.js'
import { Spinner, EmptyState } from '../../components/ui.jsx'
import PushToggle from '../../components/PushToggle.jsx'
import { IconBell, IconWarn, IconInfo } from '../../components/icons.jsx'

const PRIO = {
  urgent: { cls: 'overdue', label: 'Urgent', icon: IconWarn, color: 'var(--danger)' },
  info: { cls: 'pending', label: 'Info', icon: IconInfo, color: 'var(--info)' },
  normal: { cls: 'green', label: 'Notice', icon: IconBell, color: 'var(--green)' },
}

export default function TenantNotifications() {
  const { userId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(null) // notice id expanded in place

  useEffect(() => {
    (async () => {
      const list = await db.listTenantNotifications(userId)
      setItems(list)
      // Opening the page marks everything read.
      await Promise.all(list.filter((n) => !n.read).map((n) => db.markNotificationRead(n.id, userId)))
      setLoading(false)
    })()
  }, [userId])

  return (
    <div className="page" style={{ maxWidth: 780 }}>
      <div className="page-head">
        <div className="eyebrow">Inbox</div>
        <h1>Notifications</h1>
        <p>Rent reminders and notices from your property manager.</p>
      </div>

      <PushToggle blurb="Get rent reminders on this device the moment they're sent — even when RentLoja is closed." />

      {loading ? <div className="center" style={{ minHeight: 200 }}><Spinner /></div>
        : items.length === 0 ? (
          <div className="card"><EmptyState icon="🔔" title="Nothing here yet">Messages from your manager will show up here.</EmptyState></div>
        ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
            {items.map((n) => {
              const pr = PRIO[n.priority] || PRIO.normal
              // Urgent stays red; otherwise the dot marks what was unread when
              // the page opened (everything is marked read on arrival).
              const dot = n.priority === 'urgent' ? 'var(--danger)' : !n.read ? 'var(--accent)' : 'var(--line)'
              const openMe = open === n.id
              return (
                <div key={n.id} className="ntx-row" role="button" tabIndex={0} aria-expanded={openMe}
                  onClick={() => setOpen(openMe ? null : n.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setOpen(openMe ? null : n.id) }}>
                  <span className="ntx-dot" style={{ background: dot }} />
                  <div className="ntx-main">
                    <div className="ntx-name">{n.subject} <span className="muted" style={{ fontWeight: 400 }}>· {pr.label}</span></div>
                    {openMe
                      ? <p className="ntx-full">{n.message}</p>
                      : <div className="muted ntx-sub">{n.message}</div>}
                  </div>
                  <span className="ntx-when">{timeAgo(n.created_at)}</span>
                </div>
              )
            })}
            <style>{`
              .ntx-row { display: flex; align-items: flex-start; gap: 11px; padding: 13px 16px;
                border-bottom: 1px solid var(--line-soft); cursor: pointer; transition: background 0.13s; }
              .ntx-row:last-child { border-bottom: none; }
              .ntx-row:hover { background: var(--accent-bg); }
              .ntx-row:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--accent); }
              .ntx-dot { width: 9px; height: 9px; border-radius: 99px; flex-shrink: 0; margin-top: 5px; }
              .ntx-main { flex: 1; min-width: 0; }
              .ntx-name { font-weight: 600; font-size: 0.92rem; }
              .ntx-sub { font-size: 0.78rem; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
              .ntx-full { font-size: 0.86rem; margin: 6px 0 0; white-space: pre-wrap; line-height: 1.6; color: var(--text-dim); }
              .ntx-when { font-size: 0.7rem; color: var(--text-faint); flex-shrink: 0; margin-top: 3px; }
            `}</style>
          </div>
        )}
    </div>
  )
}
