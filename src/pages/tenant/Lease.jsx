import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { fmtDate, money } from '../../lib/format.js'
import { printLease, leaseTermLabel } from '../../lib/leaseDoc.js'
import { Spinner, EmptyState } from '../../components/ui.jsx'
import Modal from '../../components/Modal.jsx'
import { Input } from '../../components/Field.jsx'

export default function TenantLease() {
  const { userId, profile } = useAuth()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [leases, setLeases] = useState([])
  const [manager, setManager] = useState(null)
  const [signing, setSigning] = useState(null) // lease being signed
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const [lz, m] = await Promise.all([db.listMyLeases(userId), db.getTenantManager(userId).catch(() => null)])
    setLeases(lz); setManager(m); setLoading(false)
  }
  useEffect(() => { load() }, [userId])

  const view = (l) => {
    if (l.kind === 'uploaded' && l.document_url) window.open(l.document_url, '_blank')
    else printLease({ lease: l, tenant: profile, manager, property: null })
  }
  const sign = async () => {
    if (!name.trim()) return toast.error('Type your full name to sign')
    setBusy(true)
    try {
      await db.signLease(signing.id, name.trim())
      toast.success('Lease signed', 'A signed copy is saved for you and your manager.')
      setSigning(null); setName(''); load()
    } catch (e) { toast.error('Could not sign', e.message); setBusy(false) }
  }

  if (loading) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div className="page-head">
        <div className="eyebrow">Your tenancy</div>
        <h1>Lease</h1>
        <p>View your lease agreement and sign it.</p>
      </div>

      {leases.length === 0 ? (
        <div className="card"><EmptyState icon="📄" title="No lease yet">Your manager hasn’t sent you a lease agreement yet.</EmptyState></div>
      ) : leases.map((l) => (
        <div key={l.id} className="card pad" style={{ marginBottom: 16 }}>
          <div className="row gap wrap">
            <b>{l.kind === 'uploaded' ? (l.file_name || 'Lease document') : 'Residential Lease Agreement'}</b>
            <span className={`pill ${l.status === 'signed' ? 'green' : ''}`}>
              {l.status === 'signed' ? 'Signed' : 'Awaiting your signature'}
            </span>
          </div>
          <div className="muted" style={{ fontSize: '.84rem', marginTop: 4 }}>
            {l.kind === 'uploaded' ? 'Uploaded by your manager' : `${leaseTermLabel(l)} · Rent ${money(l.rent)}${l.currency ? ' ' + l.currency : ''}`}
            {l.status === 'signed' && ` · You signed on ${fmtDate(l.signed_at)}`}
          </div>
          <div className="row gap" style={{ marginTop: 14 }}>
            <button className="btn ghost" onClick={() => view(l)}>View / download</button>
            {l.status !== 'signed' && <button className="btn primary" onClick={() => setSigning(l)}>Review &amp; sign</button>}
          </div>
        </div>
      ))}

      {signing && (
        <Modal title="Sign your lease" onClose={() => setSigning(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setSigning(null)}>Cancel</button>
            <button className="btn primary" onClick={sign} disabled={busy}>{busy ? 'Signing…' : 'Sign lease'}</button>
          </>}>
          <p className="muted" style={{ marginTop: 0 }}>
            Please review the lease first. By typing your full name below and signing, you agree to the terms of this lease.
          </p>
          <button className="btn ghost block" style={{ marginBottom: 14 }} onClick={() => view(signing)}>Open the lease to review</button>
          <Input label="Type your full name to sign" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
          <p className="hint">This is an electronic signature, dated {fmtDate(new Date().toISOString())}.</p>
        </Modal>
      )}
    </div>
  )
}
