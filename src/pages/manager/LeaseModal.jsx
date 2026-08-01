import { useState } from 'react'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { fileToProof } from '../../lib/upload.js'
import { fullName } from '../../lib/format.js'
import Modal from '../../components/Modal.jsx'
import { Input, Textarea, Row } from '../../components/Field.jsx'

// Manager creates a lease for a tenant — either generated from editable terms
// (auto-filled from the tenant), or their own uploaded file. Sent on save.
export default function LeaseModal({ tenant, property, manager, onClose, onSaved }) {
  const toast = useToast()
  const [kind, setKind] = useState('generated')
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState(null) // { url, name }
  const [form, setForm] = useState({
    rent: (tenant.rent ?? '') + '',
    deposit: (tenant.rent ?? '') + '',
    currency: manager?.currency || 'USD',
    start_date: tenant.lease_start || new Date().toISOString().slice(0, 10),
    term_months: 12,
    due_day: tenant.due_day || 1,
    terms: '',
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // End date derived from start + term.
  const endDate = (() => {
    if (!form.start_date || !form.term_months) return ''
    const d = new Date(form.start_date); d.setMonth(d.getMonth() + Number(form.term_months))
    return d.toISOString().slice(0, 10)
  })()

  const onFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    try { const p = await fileToProof(f); setFile({ url: p.url, name: p.name || f.name }) }
    catch (err) { toast.error('Upload failed', err.message) }
  }

  const save = async () => {
    if (kind === 'uploaded' && !file) return toast.error('Choose a file to upload')
    setBusy(true)
    try {
      const base = { tenant_id: tenant.id, property_id: tenant.property_id || null, kind, status: 'sent' }
      const data = kind === 'uploaded'
        ? { ...base, document_url: file.url, file_name: file.name }
        : {
          ...base, rent: Number(form.rent) || 0, deposit: Number(form.deposit) || 0, currency: form.currency,
          start_date: form.start_date, end_date: endDate || null, due_day: Number(form.due_day) || null,
          term_months: Number(form.term_months) || null, terms: form.terms,
        }
      await db.createLease(manager?.id, data)
      toast.success('Lease sent', `${fullName(tenant)} can now view and sign it.`)
      onSaved()
    } catch (err) { toast.error('Could not create lease', err.message); setBusy(false) }
  }

  return (
    <Modal title={`Lease — ${fullName(tenant)}`} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Sending…' : 'Create & send lease'}</button>
      </>}>
      <div className="seg" style={{ marginBottom: 16 }}>
        <button className={kind === 'generated' ? 'on' : ''} onClick={() => setKind('generated')}>Generate</button>
        <button className={kind === 'uploaded' ? 'on' : ''} onClick={() => setKind('uploaded')}>Upload file</button>
      </div>

      {kind === 'generated' ? (
        <>
          <Row>
            <Input label="Monthly rent" type="number" min="0" step="1" value={form.rent} onChange={set('rent')} />
            <Input label="Security deposit" type="number" min="0" step="1" value={form.deposit} onChange={set('deposit')} />
          </Row>
          <Row>
            <Input label="Start date" type="date" value={form.start_date} onChange={set('start_date')} />
            <Input label="Term (months)" type="number" min="1" value={form.term_months} onChange={set('term_months')} />
          </Row>
          <Row>
            <Input label="Rent due day" type="number" min="1" max="28" value={form.due_day} onChange={set('due_day')} />
            <Input label="End date" type="date" value={endDate} readOnly />
          </Row>
          <Textarea label="Additional terms (optional)" value={form.terms} onChange={set('terms')}
            placeholder="Any extra clauses — e.g. no pets, garden upkeep…" style={{ minHeight: 90 }} />
          <p className="hint">A full lease with standard clauses is generated from these details. The tenant can view and e-sign it.</p>
        </>
      ) : (
        <>
          <label className="dropzone" style={{ cursor: 'pointer' }}>
            <input type="file" accept="application/pdf,image/*" onChange={onFile} style={{ display: 'none' }} />
            <span>{file ? `Selected: ${file.name}` : 'Click to choose a PDF or image lease file'}</span>
          </label>
          <p className="hint" style={{ marginTop: 10 }}>Upload your own lease document. The tenant can view, download and e-sign it.</p>
          <style>{`.dropzone{display:flex;align-items:center;justify-content:center;padding:26px;border:1.5px dashed var(--line);border-radius:var(--radius);background:var(--bg);color:var(--text-dim);text-align:center;}
            .dropzone:hover{border-color:var(--green-line);color:var(--text);}`}</style>
        </>
      )}
    </Modal>
  )
}
