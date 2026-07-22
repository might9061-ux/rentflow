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
          <div className="col" style={{ gap: 14 }}>
            {items.map((n) => {
              const pr = PRIO[n.priority] || PRIO.normal
              const Icon = pr.icon
              return (
                <div key={n.id} className="card pad">
                  <div className="spread wrap" style={{ gap: 10 }}>
                    <div className="row gap">
                      <span style={{ color: pr.color }}><Icon size={16} /></span>
                      <span className={`pill ${pr.cls}`}>{pr.label}</span>
                    </div>
                    <span className="muted" style={{ fontSize: '0.8rem' }}>{timeAgo(n.created_at)}</span>
                  </div>
                  <h3 style={{ marginTop: 12, fontSize: '1.2rem' }}>{n.subject}</h3>
                  <p className="muted" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{n.message}</p>
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}
