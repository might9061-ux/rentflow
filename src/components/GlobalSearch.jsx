import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { db } from '../lib/db.js'
import { fullName } from '../lib/format.js'
import { prettyPhone } from '../lib/phone.js'
import { IconUsers, IconBuilding, IconArrowRight, IconShield } from './icons.jsx'

// Spotlight-style search across the workspace: tenants, properties, and (for the
// owner) agents. Data volumes here are small (tens–hundreds), so it filters in
// memory — no need for a search endpoint. Opens on the topbar box, Ctrl/⌘-K, or "/".
export default function GlobalSearch({ open, onClose }) {
  const { userId, profile } = useAuth()
  const isOwner = profile?.role !== 'staff'
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [data, setData] = useState(null)
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)

  // Load once when first opened; refresh each open so new tenants show up.
  useEffect(() => {
    if (!open) return
    setQ(''); setActive(0)
    ;(async () => {
      try {
        const [tenants, properties, team] = await Promise.all([
          db.listTenants(userId),
          db.listProperties(userId),
          // Agents are an owner-only concept; staff can't list the team.
          isOwner ? db.listTeam(userId).catch(() => []) : Promise.resolve([]),
        ])
        setData({ tenants, properties, team })
      } catch { setData({ tenants: [], properties: [], team: [] }) }
    })()
    setTimeout(() => inputRef.current?.focus(), 30)
  }, [open, userId, isOwner])

  const results = useMemo(() => {
    if (!data) return []
    const term = q.trim().toLowerCase()
    if (!term) return []
    const hits = []
    for (const t of data.tenants) {
      const name = fullName(t).toLowerCase()
      const hay = `${name} ${t.email || ''} ${t.phone || ''} ${t.unit || ''}`.toLowerCase()
      if (hay.includes(term)) hits.push({
        type: 'tenant', id: t.id, title: fullName(t),
        sub: [t.unit && `Unit ${t.unit}`, t.phone && prettyPhone(t.phone), t.email].filter(Boolean).join(' · '),
        to: `/manager/tenants/${t.id}`,
      })
    }
    for (const p of data.properties) {
      const hay = `${p.name || ''} ${p.address || ''}`.toLowerCase()
      if (hay.includes(term)) hits.push({
        type: 'property', id: p.id, title: p.name || 'Property',
        sub: [p.address, p.units && `${p.units} units`].filter(Boolean).join(' · '),
        to: `/manager/properties/${p.id}`,
      })
    }
    for (const s of (data.team || [])) {
      const name = fullName(s).toLowerCase()
      const hay = `${name} ${s.email || ''} ${s.phone || ''}`.toLowerCase()
      if (hay.includes(term)) hits.push({
        type: 'agent', id: s.id, title: fullName(s),
        sub: [s.email, s.phone && prettyPhone(s.phone), s.account_status === 'suspended' && 'Suspended'].filter(Boolean).join(' · '),
        // Agents have no detail page of their own — the Team page opens them.
        to: `/manager/team?agent=${s.id}`,
      })
    }
    return hits.slice(0, 12)
  }, [q, data])

  useEffect(() => { setActive(0) }, [q])

  if (!open) return null

  const go = (r) => { if (!r) return; onClose(); nav(r.to) }
  const onKey = (e) => {
    if (e.key === 'Escape') return onClose()
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    if (e.key === 'Enter') { e.preventDefault(); go(results[active]) }
  }

  return (
    <div className="gs-overlay" onClick={onClose}>
      <div className="gs-panel" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef} className="gs-input" placeholder={isOwner ? 'Search tenants, properties, agents…' : 'Search tenants, properties…'}
          value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} />

        <div className="gs-results">
          {!data && <div className="gs-empty">Loading…</div>}
          {data && q.trim() && results.length === 0 && <div className="gs-empty">No matches for “{q.trim()}”.</div>}
          {data && !q.trim() && <div className="gs-empty">Type a name, unit, phone or address.</div>}
          {results.map((r, i) => (
            <button key={`${r.type}-${r.id}`} className={`gs-row ${i === active ? 'on' : ''}`}
              onMouseEnter={() => setActive(i)} onClick={() => go(r)}>
              <span className={`gs-ico ${r.type}`}>
                {r.type === 'tenant' ? <IconUsers size={16} />
                  : r.type === 'agent' ? <IconShield size={16} />
                  : <IconBuilding size={16} />}
              </span>
              <span className="gs-text">
                <span className="gs-title">{r.title}</span>
                {r.sub && <span className="gs-sub">{r.sub}</span>}
              </span>
              <IconArrowRight size={14} className="gs-go" />
            </button>
          ))}
        </div>
      </div>

      <style>{`
        .gs-overlay { position: fixed; inset: 0; z-index: 9997; background: rgba(5,4,3,0.55);
          backdrop-filter: blur(2px); display: flex; justify-content: center; align-items: flex-start;
          padding: 12vh 20px 20px; animation: fade 0.14s ease; }
        .gs-panel { width: 100%; max-width: 560px; background: var(--surface); border: 1px solid var(--line);
          border-radius: var(--radius-lg); box-shadow: 0 30px 80px -30px rgba(0,0,0,0.6); overflow: hidden; }
        .gs-input { width: 100%; border: none; background: transparent; color: var(--text);
          font-size: 1.05rem; padding: 18px 20px; outline: none; border-bottom: 1px solid var(--line-soft); }
        .gs-results { max-height: 52vh; overflow-y: auto; padding: 6px; }
        .gs-empty { padding: 22px; text-align: center; color: var(--text-faint); font-size: 0.9rem; }
        .gs-row { width: 100%; display: flex; align-items: center; gap: 12px; padding: 11px 13px; border: none;
          background: transparent; border-radius: var(--radius); text-align: left; cursor: pointer; }
        .gs-row.on { background: var(--accent-bg); }
        .gs-ico { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; flex-shrink: 0;
          background: var(--surface-2); border: 1px solid var(--line); color: var(--text-dim); }
        .gs-ico.tenant { background: var(--green-bg); border-color: var(--green-line); color: var(--green); }
        .gs-ico.property { background: var(--gold-bg); border-color: var(--gold-line); color: var(--gold); }
        .gs-ico.agent { background: var(--accent-bg); border-color: var(--accent-line); color: var(--accent); }
        .gs-text { min-width: 0; flex: 1; display: flex; flex-direction: column; }
        .gs-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .gs-sub { font-size: 0.8rem; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .gs-go { color: var(--text-faint); flex-shrink: 0; }
        .gs-row.on .gs-go { color: var(--accent); }
      `}</style>
    </div>
  )
}
