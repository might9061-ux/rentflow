import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { fullName, initials } from '../../lib/format.js'
import { prettyPhone } from '../../lib/phone.js'
import { sendWhatsApp } from '../../lib/whatsapp.js'
import Modal from '../../components/Modal.jsx'
import PhoneInput from '../../components/PhoneInput.jsx'
import { Spinner, EmptyState } from '../../components/ui.jsx'
import { IconBuilding, IconPlus, IconEdit, IconKey, IconTrash, IconWhatsapp, IconMail } from '../../components/icons.jsx'

export default function Team() {
  const { userId } = useAuth()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [team, setTeam] = useState([])
  const [properties, setProperties] = useState([])
  const [editing, setEditing] = useState(null) // staff object or {} for new
  const [creds, setCreds] = useState(null)
  const [q, setQ] = useState('')
  const [menuFor, setMenuFor] = useState(null) // agent id whose ⋯ menu is open
  const [params, setParams] = useSearchParams()

  useEffect(() => {
    if (!menuFor) return
    const close = () => setMenuFor(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuFor])

  const load = useCallback(async () => {
    const [t, p] = await Promise.all([db.listTeam(userId), db.listProperties(userId)])
    setTeam(t); setProperties(p); setLoading(false)
  }, [userId])
  useEffect(() => { load() }, [load])

  // Arriving from global search (?agent=<id>) opens that agent straight away.
  useEffect(() => {
    const id = params.get('agent')
    if (!id || !team.length) return
    const s = team.find((x) => x.id === id)
    if (s) setEditing(s)
    setParams({}, { replace: true })
  }, [params, team, setParams])

  // Filter the visible list — names, email or phone.
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return team
    return team.filter((s) => `${fullName(s)} ${s.email || ''} ${s.phone || ''}`.toLowerCase().includes(term))
  }, [q, team])

  if (loading) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>

  const propName = (id) => properties.find((p) => p.id === id)?.name || '—'
  const coveredCount = new Set(team.flatMap((s) => s.assigned_property_ids || [])).size

  const resend = async (s) => {
    // Only warn once they've set their own password — before that it's just the
    // initial temp-password handover, with no real password to disrupt.
    if (!s.first_login && !window.confirm(`Reset ${fullName(s)}'s password?\n\nThey've already set their own — this replaces it with a new temporary one, so their current password stops working and you'll need to send them the new one.`)) return
    const { tempPassword } = await db.resendStaffCredentials(s.id)
    toast.success('New password generated')
    setCreds({ staff: s, tempPassword })
  }
  const remove = async (s) => {
    if (!window.confirm(`Remove ${fullName(s)} from your team? They will lose access immediately.`)) return
    await db.removeStaff(s.id)
    toast.success('Agent removed')
    load()
  }

  return (
    <div className="page" style={{ maxWidth: 940 }}>
      <div className="spread page-head">
        <div>
          <div className="eyebrow">Access</div>
          <h1>Agents</h1>
          <p>Invite agents and assign each one the properties they can see and manage. You are the workspace manager; everyone else is an agent.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing({})}><IconPlus size={16} /> Add agent</button>
      </div>

      <div className="ag-kpis">
        <div><b>{team.length}</b><span>Agents</span></div>
        <div><b>{coveredCount}/{properties.length}</b><span>Covered</span></div>
        <div><b>{team.filter((s) => s.account_status === 'suspended').length}</b><span>Suspended</span></div>
      </div>

      {team.length === 0 ? (
        <div className="card"><EmptyState icon="🛡️" title="No agents yet">Invite an agent and choose which properties they can access.</EmptyState></div>
      ) : (
        <>
        {team.length > 4 && (
          <input className="input" style={{ maxWidth: 340, marginBottom: 14 }} placeholder="Search agents by name, email or phone…"
            value={q} onChange={(e) => setQ(e.target.value)} />
        )}
        {filtered.length === 0 ? (
          <div className="card"><EmptyState icon="🔍" title="No matches">No agent matches “{q.trim()}”.</EmptyState></div>
        ) : (
        <div className="card" style={{ overflow: 'visible' }}>
          {filtered.map((s) => {
            const suspended = s.account_status === 'suspended'
            const props = (s.assigned_property_ids || []).map(propName).filter((n) => n !== '—')
            return (
              <div key={s.id} className="ag-row">
                <span className="ag-dot" style={{ background: suspended ? 'var(--danger)' : 'var(--green)' }} />
                <div className="avatar" style={{ width: 36, height: 36, fontSize: '0.8rem', flexShrink: 0 }}>{initials(s.first_name, s.last_name)}</div>
                <div className="ag-main">
                  <div className="ag-name">
                    {fullName(s)}
                    <span className="muted" style={{ fontWeight: 400 }}> · {props.length ? props.join(' · ') : <span style={{ color: 'var(--warn)' }}>no properties assigned</span>}</span>
                    {suspended && <span className="pill overdue" style={{ marginLeft: 8, fontSize: '0.66rem', padding: '2px 8px' }}>Suspended</span>}
                    {s.can_payroll && <span className="pill gold" style={{ marginLeft: 8, fontSize: '0.66rem', padding: '2px 8px' }} title="Can manage payroll">Payroll</span>}
                  </div>
                  <div className="muted ag-sub">{[s.email, s.phone && prettyPhone(s.phone)].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                <button className="btn sm ghost" onClick={() => setEditing(s)}><IconEdit size={14} /> Edit</button>
                <span style={{ position: 'relative' }}>
                  <button className="btn sm ghost" title="More" aria-label="More actions"
                    onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === s.id ? null : s.id) }}>⋯</button>
                  {menuFor === s.id && (
                    <div className="ag-menu" onClick={(e) => e.stopPropagation()}>
                      {/* The temporary key is only for the first-login handover. Once
                          the agent has set their own password, they sign in with it
                          (and can self-serve via "Forgot password?"), so there's no
                          temp key to hand out — hide it. */}
                      {s.first_login && (
                        <button onClick={() => { setMenuFor(null); resend(s) }}><IconKey size={13} /> Resend temp password</button>
                      )}
                      <button className="danger" onClick={() => { setMenuFor(null); remove(s) }}><IconTrash size={13} /> Remove</button>
                    </div>
                  )}
                </span>
              </div>
            )
          })}
        </div>
        )}

        <style>{`
          .ag-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--line-soft);
            border: 1px solid var(--line-soft); border-radius: var(--radius); overflow: hidden; margin-bottom: 24px; }
          .ag-kpis > div { background: var(--surface); padding: 12px 14px; text-align: center; }
          .ag-kpis b { display: block; font-size: 1.15rem; font-weight: 700; }
          .ag-kpis span { font-size: 0.66rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-faint); }
          .ag-row { display: flex; align-items: center; gap: 12px; padding: 13px 16px; border-bottom: 1px solid var(--line-soft); }
          .ag-row:last-child { border-bottom: none; }
          .ag-dot { width: 9px; height: 9px; border-radius: 99px; flex-shrink: 0; }
          .ag-main { flex: 1; min-width: 0; }
          .ag-name { font-weight: 600; font-size: 0.92rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .ag-sub { font-size: 0.78rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .ag-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; min-width: 190px;
            background: var(--surface); border: 1px solid var(--line); border-radius: 10px;
            box-shadow: 0 10px 28px -12px rgba(13,27,46,0.35); padding: 5px; }
          .ag-menu button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 11px;
            background: none; border: none; border-radius: 7px; color: var(--text); font-size: 0.86rem;
            cursor: pointer; text-align: left; }
          .ag-menu button:hover { background: var(--accent-bg); }
          .ag-menu button.danger { color: var(--danger); }
          @media (max-width: 560px) {
            .ag-row { flex-wrap: wrap; }
            .ag-main { flex-basis: calc(100% - 60px); }
            .ag-name, .ag-sub { white-space: normal; }
          }
        `}</style>
        </>
      )}

      {editing && (
        <StaffModal staff={editing.id ? editing : null} properties={properties}
          onClose={() => setEditing(null)}
          onSaved={(c) => { setEditing(null); if (c) setCreds(c); load() }} />
      )}
      {creds && <CredentialsModal staff={creds.staff} tempPassword={creds.tempPassword} onClose={() => setCreds(null)} />}
    </div>
  )
}

function StaffModal({ staff, properties, onClose, onSaved }) {
  const { userId } = useAuth()
  const toast = useToast()
  const isEdit = !!staff
  const [first, setFirst] = useState(staff?.first_name || '')
  const [last, setLast] = useState(staff?.last_name || '')
  const [email, setEmail] = useState(staff?.email || '')
  const [phone, setPhone] = useState(staff?.phone || '')
  const [assigned, setAssigned] = useState(new Set(staff?.assigned_property_ids || []))
  const [suspended, setSuspended] = useState(staff?.account_status === 'suspended')
  const [canPayroll, setCanPayroll] = useState(!!staff?.can_payroll)
  const [busy, setBusy] = useState(false)

  const toggleProp = (id) => setAssigned((cur) => {
    const next = new Set(cur); next.has(id) ? next.delete(id) : next.add(id); return next
  })

  const save = async () => {
    if (!first.trim() || !last.trim()) return toast.error('Name required')
    if (!isEdit && !email.trim()) return toast.error('Email required')
    setBusy(true)
    try {
      const ids = [...assigned]
      if (isEdit) {
        await db.updateStaff(staff.id, {
          first_name: first.trim(), last_name: last.trim(), phone,
          assigned_property_ids: ids, account_status: suspended ? 'suspended' : 'active', can_payroll: canPayroll,
        })
        toast.success('Agent updated')
        onSaved(null)
      } else {
        const { staff: created, tempPassword } = await db.createStaff(userId, {
          first_name: first.trim(), last_name: last.trim(), email: email.trim(), phone, assigned_property_ids: ids, can_payroll: canPayroll,
        })
        toast.success('Agent invited')
        onSaved({ staff: created, tempPassword })
      }
    } catch (err) { toast.error('Could not save', err.message) }
    finally { setBusy(false) }
  }

  return (
    <Modal title={isEdit ? `Edit ${fullName(staff)}` : 'Add agent'} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : isEdit ? 'Save changes' : 'Send invite'}</button>
      </>}>
      <div className="field-row">
        <div className="field"><label>First name</label><input className="input" value={first} onChange={(e) => setFirst(e.target.value)} /></div>
        <div className="field"><label>Last name</label><input className="input" value={last} onChange={(e) => setLast(e.target.value)} /></div>
      </div>
      <div className="field">
        <label>Email</label>
        <input className="input" type="email" value={email} disabled={isEdit}
          onChange={(e) => setEmail(e.target.value)} placeholder="agent@example.com" />
        {isEdit && <div className="hint">Email is the login and can’t be changed.</div>}
      </div>
      <PhoneInput label="Phone (optional)" value={phone} onChange={setPhone} />

      <div className="field" style={{ marginBottom: 6 }}><label>Assigned properties</label></div>
      <div className="col" style={{ gap: 8 }}>
        {properties.length === 0 && <div className="muted" style={{ fontSize: '0.85rem' }}>No properties yet — add one first.</div>}
        {properties.map((p) => (
          <label key={p.id} className="spread" style={{
            padding: '10px 13px', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
            background: assigned.has(p.id) ? 'var(--accent-bg)' : 'var(--bg)', cursor: 'pointer',
          }}>
            <div className="row gap"><IconBuilding size={15} /><div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{p.name}</div>
              <div className="muted" style={{ fontSize: '0.76rem' }}>{p.location || p.suburb || '—'} · {p.units} units</div>
            </div></div>
            <span className="switch"><input type="checkbox" checked={assigned.has(p.id)} onChange={() => toggleProp(p.id)} /><span className="track" /></span>
          </label>
        ))}
      </div>

      <div className="field" style={{ marginTop: 16, marginBottom: 6 }}><label>Permissions</label></div>
      <label className="spread" style={{ padding: '11px 14px', border: '1px solid var(--line)', borderRadius: 'var(--radius)', cursor: 'pointer', background: canPayroll ? 'var(--accent-bg)' : 'var(--bg)' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Can manage payroll</div>
          <div className="muted" style={{ fontSize: '0.78rem' }}>Let this agent add staff and pay salaries (workspace-wide).</div>
        </div>
        <span className="switch"><input type="checkbox" checked={canPayroll} onChange={() => setCanPayroll((v) => !v)} /><span className="track" /></span>
      </label>

      {isEdit && (
        <label className="spread" style={{ marginTop: 10, padding: '11px 14px', border: '1px solid var(--line)', borderRadius: 'var(--radius)', cursor: 'pointer' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Suspend access</div>
            <div className="muted" style={{ fontSize: '0.78rem' }}>They keep their account but can’t sign in.</div>
          </div>
          <span className="switch"><input type="checkbox" checked={suspended} onChange={() => setSuspended((v) => !v)} /><span className="track" /></span>
        </label>
      )}
    </Modal>
  )
}

function CredentialsModal({ staff, tempPassword, onClose }) {
  if (!staff) return null // nothing to show without a staff record — never crash on staff.phone
  const share = () => {
    const msg = `Hi ${staff.first_name}, you've been added as a manager on RentLoja.\n\n` +
      `Sign in here: ${window.location.origin} (choose “Manager”).\nEmail: ${staff.email}\nTemporary password: ${tempPassword}\n\n` +
      `Please change your password after your first sign-in.`
    sendWhatsApp(staff.phone, msg)
  }
  return (
    <Modal title="Agent login" onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Done</button>
        {staff.phone && <button className="btn wa" onClick={share}><IconWhatsapp size={16} /> Send via WhatsApp</button>}
      </>}>
      <p className="muted" style={{ marginBottom: 18 }}>
        <b style={{ color: 'var(--text)' }}>{fullName(staff)}</b> can now sign in on the <b style={{ color: 'var(--text)' }}>Manager</b> login.
        Share these one-time details — ask them to change the password after first sign-in.
      </p>
      <div className="cred-box">
        <div className="cred-row"><span className="row gap muted"><IconMail size={15} /> Email</span><b>{staff.email}</b></div>
        <div className="cred-row"><span className="row gap muted"><IconKey size={15} /> Temp password</span>
          <b className="mono" style={{ color: 'var(--gold)', letterSpacing: 1 }}>{tempPassword}</b></div>
      </div>
      <style>{`
        .cred-box { border:1px solid var(--line); border-radius:var(--radius); overflow:hidden; }
        .cred-row { display:flex; justify-content:space-between; align-items:center; padding:13px 16px; border-bottom:1px solid var(--line-soft); }
        .cred-row:last-child { border-bottom:none; }
      `}</style>
    </Modal>
  )
}
