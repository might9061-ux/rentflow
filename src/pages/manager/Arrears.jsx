import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { db } from '../../lib/db.js'
import { money, fullName } from '../../lib/format.js'
import { computeArrears, lateFeeFor } from '../../lib/arrears.js'
import { StatCard, Spinner, EmptyState } from '../../components/ui.jsx'
import { IconClock, IconUsers, IconWallet, IconWhatsapp, IconWarn } from '../../components/icons.jsx'
import { sendWhatsApp } from '../../lib/whatsapp.js'
import { prettyPhone } from '../../lib/phone.js'
import RecordPaymentModal from './RecordPaymentModal.jsx'

export default function Arrears() {
  const { userId, profile } = useAuth()
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [tenants, setTenants] = useState([])
  const [properties, setProperties] = useState([])
  const [payments, setPayments] = useState([])
  const [manager, setManager] = useState(null)
  const [recording, setRecording] = useState(null) // tenant

  const load = useCallback(async () => {
    const [t, p, pays, m] = await Promise.all([db.listTenants(userId), db.listProperties(userId), db.listPayments(userId), db.getWorkspaceManager(userId)])
    setTenants(t); setProperties(p); setPayments(pays); setManager(m); setLoading(false)
  }, [userId])
  useEffect(() => { load() }, [load])

  if (loading) return <div className="center" style={{ minHeight: 200 }}><Spinner /></div>

  const propName = (id) => properties.find((p) => p.id === id)?.name || '—'
  const feeOn = !!manager?.late_fee_enabled

  const debtors = tenants
    .filter((t) => t.account_status === 'active')
    .map((t) => { const arr = computeArrears(t, payments); const fee = lateFeeFor(t, manager, payments); return { t, arr, fee, due: arr.total + fee } })
    .filter((x) => x.arr.total > 0)
    .sort((a, b) => b.due - a.due)

  const totalArrears = debtors.reduce((s, x) => s + x.arr.total, 0)
  const broughtTotal = debtors.reduce((s, x) => s + x.arr.broughtForward, 0)
  const totalFees = debtors.reduce((s, x) => s + x.fee, 0)

  const remind = (t, arr, fee) => {
    const msg = `Hi ${t.first_name}, a reminder that your rent account shows ${money(arr.total + fee)} outstanding` +
      (arr.broughtForward > 0 ? ` (including ${money(arr.broughtForward)} carried over from previous months)` : '') +
      (fee > 0 ? ` and a ${money(fee)} late fee` : '') +
      `. Kindly arrange payment. Thank you — ${profile?.first_name || 'your manager'} (via RentPilot).`
    sendWhatsApp(t.phone, msg)
  }

  return (
    <>
      <p className="muted" style={{ marginTop: -6, marginBottom: 20 }}>
        Tenants who haven’t fully paid — including balances carried from previous months. They clear once paid.
      </p>

      <div className="grid stats" style={{ marginBottom: 24 }}>
        <StatCard label="Total arrears" value={money(totalArrears)} sub={`${debtors.length} tenant${debtors.length === 1 ? '' : 's'} behind`} icon={<IconWallet size={18} />} />
        <StatCard label="Brought forward" value={money(broughtTotal)} sub="From previous months" icon={<IconClock size={18} />} />
        {feeOn
          ? <StatCard label="Late fees" value={money(totalFees)} sub="Added to overdue" icon={<IconWarn size={18} />} />
          : <StatCard label="In arrears" value={debtors.length} sub="Active tenants" icon={<IconUsers size={18} />} />}
      </div>

      {debtors.length === 0 ? (
        <div className="card"><EmptyState icon="🎉" title="Everyone’s paid up">No outstanding balances right now.</EmptyState></div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Tenant</th><th>Property / Unit</th><th>Brought forward</th><th>This month</th>{feeOn && <th>Late fee</th>}<th>{feeOn ? 'Due now' : 'Total owed'}</th><th>Behind</th><th></th></tr>
            </thead>
            <tbody>
              {debtors.map(({ t, arr, fee, due }) => (
                <tr key={t.id} className="clickable-row" onClick={() => nav(`/manager/tenants/${t.id}`)}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{fullName(t)}</div>
                    <div className="muted" style={{ fontSize: '0.8rem' }}>{prettyPhone(t.phone)}</div>
                  </td>
                  <td>
                    <div>{propName(t.property_id)}</div>
                    <div className="muted" style={{ fontSize: '0.8rem' }}>Unit {t.unit || '—'}</div>
                  </td>
                  <td className="mono" style={{ color: arr.broughtForward > 0 ? 'var(--danger)' : 'var(--text-faint)' }}>{money(arr.broughtForward)}</td>
                  <td className="mono">{money(arr.currentOwed)}</td>
                  {feeOn && <td className="mono" style={{ color: fee > 0 ? 'var(--danger)' : 'var(--text-faint)' }}>{fee > 0 ? money(fee) : '—'}</td>}
                  <td className="mono" style={{ fontWeight: 700, color: 'var(--warn)' }}>{money(due)}</td>
                  <td><span className="pill overdue">{arr.monthsBehind} mo</span></td>
                  <td>
                    <div className="row gap" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn sm ghost wa" title="WhatsApp reminder" onClick={(e) => { e.stopPropagation(); remind(t, arr, fee) }}><IconWhatsapp size={14} /></button>
                      <button className="btn sm primary" onClick={(e) => { e.stopPropagation(); setRecording(t) }}>Record payment</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {recording && (
        <RecordPaymentModal tenant={recording} payments={payments.filter((p) => p.tenant_id === recording.id)}
          onClose={() => setRecording(null)}
          onRecorded={() => { setRecording(null); load() }} />
      )}
    </>
  )
}
