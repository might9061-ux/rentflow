import { useState, useEffect } from 'react'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { fileToProof } from '../../lib/upload.js'
import { fullName } from '../../lib/format.js'
import { openLease } from '../../lib/leaseDoc.js'
import { fillLeaseTemplate, STARTER_TEMPLATE, PLACEHOLDERS } from '../../lib/leaseTemplate.js'
import Modal from '../../components/Modal.jsx'
import { Input, Textarea, Row } from '../../components/Field.jsx'

// Manager creates a lease for a tenant — either generated from editable terms
// (auto-filled from the tenant), or their own uploaded file. Sent on save.
export default function LeaseModal({ tenant, property, manager, onClose, onSaved }) {
  const toast = useToast()
  const [kind, setKind] = useState('generated')
  const [busy, setBusy] = useState(false)
  // Custom template: the workspace's saved lease wording ({{placeholders}}).
  const isOwner = manager?.role !== 'staff'
  const [tpl, setTpl] = useState('')            // the template text being used/edited
  const [tplSaved, setTplSaved] = useState(false) // a template exists on the workspace
  const [tplLoaded, setTplLoaded] = useState(false)
  useEffect(() => {
    (async () => {
      try {
        const wm = await db.getWorkspaceManager(manager?.id)
        setTpl(wm?.lease_template || STARTER_TEMPLATE)
        setTplSaved(!!wm?.lease_template)
      } catch { setTpl(STARTER_TEMPLATE) }
      setTplLoaded(true)
    })()
  }, [manager?.id])
  const [signAsLandlord, setSignAsLandlord] = useState(true) // sign as landlord on create
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

  // The template with this tenant's details filled into the gaps.
  const filledTemplate = () => fillLeaseTemplate(tpl, {
    tenant, manager, property,
    lease: { rent: form.rent, deposit: form.deposit, currency: form.currency,
      start_date: form.start_date, end_date: endDate, term_months: form.term_months, due_day: form.due_day },
  })

  // A lease object built from the current form — for the live preview and save.
  const buildLease = () => ({
    kind, currency: form.currency,
    rent: Number(form.rent) || 0, deposit: Number(form.deposit) || 0,
    start_date: form.start_date, end_date: endDate || null,
    due_day: Number(form.due_day) || null, term_months: Number(form.term_months) || null,
    terms: kind === 'custom' ? filledTemplate() : form.terms,
    ...(signAsLandlord ? { manager_signed_name: fullName(manager), manager_signed_at: new Date().toISOString() } : {}),
  })

  // Preview the lease exactly as it will read, before creating it.
  const preview = () => openLease({ lease: buildLease(), tenant, manager, property })

  // Save the wording as the workspace template (owners only) so next time it's
  // already there and only the gaps change per tenant.
  const saveTemplate = async () => {
    try {
      await db.updateManagerSettings(manager.id, { lease_template: tpl })
      setTplSaved(true)
      toast.success('Template saved', 'It will be pre-filled for every future lease.')
    } catch (e) { toast.error('Could not save template', e.message) }
  }

  const save = async () => {
    if (kind === 'uploaded' && !file) return toast.error('Choose a file to upload')
    setBusy(true)
    try {
      const sig = signAsLandlord ? { manager_signed_name: fullName(manager), manager_signed_at: new Date().toISOString() } : {}
      const base = { tenant_id: tenant.id, property_id: tenant.property_id || null, kind, status: 'sent', ...sig }
      const data = kind === 'uploaded'
        ? { ...base, document_url: file.url, file_name: file.name }
        : {
          ...base, rent: Number(form.rent) || 0, deposit: Number(form.deposit) || 0, currency: form.currency,
          start_date: form.start_date, end_date: endDate || null, due_day: Number(form.due_day) || null,
          term_months: Number(form.term_months) || null,
          terms: kind === 'custom' ? filledTemplate() : form.terms,
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
        {kind !== 'uploaded' && <button className="btn ghost" onClick={preview}>Preview</button>}
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Sending…' : 'Create & send lease'}</button>
      </>}>
      <div className="seg" style={{ marginBottom: 16 }}>
        <button className={kind === 'generated' ? 'on' : ''} onClick={() => setKind('generated')}>Generate</button>
        <button className={kind === 'custom' ? 'on' : ''} onClick={() => setKind('custom')}>My template</button>
        <button className={kind === 'uploaded' ? 'on' : ''} onClick={() => setKind('uploaded')}>Upload file</button>
      </div>

      {kind === 'custom' ? (
        <>
          <Row>
            <Input label="Monthly rent" type="number" min="0" step="1" value={form.rent} onChange={set('rent')} />
            <Input label="Security deposit" type="number" min="0" step="1" value={form.deposit} onChange={set('deposit')} />
          </Row>
          <Row>
            <Input label="Start date" type="date" value={form.start_date} onChange={set('start_date')} />
            <Input label="Term (months)" type="number" min="1" value={form.term_months} onChange={set('term_months')} />
          </Row>
          <div className="field">
            <label>Your lease wording {tplSaved && <span className="muted" style={{ fontWeight: 400 }}>· saved template</span>}</label>
            <textarea className="textarea" style={{ minHeight: 200, fontFamily: 'var(--mono)', fontSize: '0.82rem' }}
              value={tplLoaded ? tpl : 'Loading…'} onChange={(e) => setTpl(e.target.value)} readOnly={!tplLoaded} />
          </div>
          <div className="row gap wrap" style={{ marginBottom: 8 }}>
            {PLACEHOLDERS.map(([k, label]) => (
              <span key={k} className="pill neutral" title={label} style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem' }}>{'{{' + k + '}}'}</span>
            ))}
          </div>
          <p className="hint">
            Write the lease once — the <b>{'{{gaps}}'}</b> above fill in automatically for {fullName(tenant)}
            (use Preview to see it filled).{isOwner ? ' Save it as your template and it will be ready for every future lease.' : ''}
          </p>
          {isOwner && (
            <button type="button" className="btn ghost sm" onClick={saveTemplate} style={{ marginTop: 4 }}>
              Save as my template
            </button>
          )}
        </>
      ) : kind === 'generated' ? (
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

      <label className="spread" style={{ marginTop: 14, padding: '11px 14px', border: '1px solid var(--line)', borderRadius: 'var(--radius)', background: signAsLandlord ? 'var(--accent-bg)' : 'var(--bg)', cursor: 'pointer' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>Sign as landlord now</div>
          <div className="muted" style={{ fontSize: '0.78rem' }}>Adds your signature ({fullName(manager)}) to the lease.</div>
        </div>
        <span className="switch"><input type="checkbox" checked={signAsLandlord} onChange={() => setSignAsLandlord((v) => !v)} /><span className="track" /></span>
      </label>
    </Modal>
  )
}
