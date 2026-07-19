import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { db } from '../../lib/db.js'
import { fileToProof } from '../../lib/upload.js'
import { canBrand, brandVars } from '../../lib/brand.js'
import { Input } from '../../components/Field.jsx'
import { Spinner } from '../../components/ui.jsx'
import { IconPalette, IconTag, IconArrowRight, IconUsers, IconTrash } from '../../components/icons.jsx'

const PRESET_COLORS = ['#c8a84b', '#5aad7e', '#6f8fd6', '#c56b8f', '#cf7a48', '#8a7bd8', '#3fae9e']

export default function Branding() {
  const { userId, refresh } = useAuth()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [manager, setManager] = useState(null)
  const [form, setForm] = useState({ brand_name: '', brand_color: '', brand_logo: null })
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const load = async () => {
    const m = await db.getManager(userId)
    setManager(m)
    setForm({ brand_name: m?.brand_name || '', brand_color: m?.brand_color || '#c8a84b', brand_logo: m?.brand_logo || null })
    setLoading(false)
  }
  useEffect(() => { load() }, [userId])

  if (loading) return <div className="page center" style={{ minHeight: 300 }}><Spinner /></div>

  const eligible = canBrand(manager)

  const onLogo = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try { const p = await fileToProof(file); setForm((f) => ({ ...f, brand_logo: p.url })) }
    catch (err) { toast.error('Upload failed', err.message) }
  }

  const save = async () => {
    setBusy(true)
    try {
      await db.updateManagerSettings(userId, {
        brand_name: form.brand_name.trim() || null,
        brand_color: form.brand_color || null,
        brand_logo: form.brand_logo || null,
      })
      await refresh()
      toast.success('Branding saved', 'Applied across your workspace and your tenants’ portal.')
      load()
    } catch (err) { toast.error('Could not save', err.message); setBusy(false) }
  }

  const resetDefault = async () => {
    setBusy(true)
    try {
      await db.updateManagerSettings(userId, { brand_name: null, brand_color: null, brand_logo: null })
      await refresh()
      setForm({ brand_name: '', brand_color: '#c8a84b', brand_logo: null })
      toast.info('Reset to default', 'The standard RentLoja design is back.')
      load()
    } catch (err) { toast.error('Could not reset', err.message) } finally { setBusy(false) }
  }

  const preview = brandVars(form.brand_color)
  const displayName = form.brand_name.trim() || 'RentLoja'

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <div className="eyebrow">Customisation</div>
        <h1>Branding</h1>
        <p>Put your own logo, name and colour across the whole app. Leave it blank to keep the default design.</p>
      </div>

      {!eligible ? (
        <div className="card pad">
          <div className="row gap" style={{ marginBottom: 10 }}>
            <span style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--gold-bg)', border: '1px solid var(--gold-line)', color: 'var(--gold)' }}><IconPalette size={20} /></span>
            <div>
              <h3 style={{ fontSize: '1.2rem' }}>Custom branding is a Growth feature</h3>
              <p className="muted" style={{ fontSize: '0.86rem' }}>Available on plans with <b>10 or more tenants</b> (Growth and above).</p>
            </div>
          </div>
          <Link to="/manager/plan" className="btn primary"><IconTag size={15} /> Upgrade your plan <IconArrowRight size={15} /></Link>
        </div>
      ) : (
        <>
          {/* Live preview */}
          <div className="card pad" style={{ marginBottom: 18, ...preview }}>
            <div className="eyebrow">Preview</div>
            <div className="row gap" style={{ marginTop: 12, marginBottom: 16 }}>
              {form.brand_logo
                ? <img className="mark-img" src={form.brand_logo} alt="logo" />
                : <div className="mark" style={{ background: 'var(--accent-bg)', borderColor: 'var(--accent-line)', color: 'var(--accent)', width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', border: '1px solid', fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '1.4rem' }}>{displayName.slice(0, 2).toUpperCase()}</div>}
              <div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: '1.5rem', fontWeight: 600, lineHeight: 1 }}>{displayName}</div>
                <div className="eyebrow" style={{ color: 'var(--accent)' }}>Your workspace</div>
              </div>
            </div>
            <div className="row gap wrap">
              <button className="btn primary" type="button">Primary button</button>
              <span className="pill" style={{ color: 'var(--accent)', background: 'var(--accent-bg)', borderColor: 'var(--accent-line)' }}><span className="dot" /> Accent pill</span>
            </div>
          </div>

          {/* Controls */}
          <div className="card pad">
            <Input label="App name" value={form.brand_name} onChange={(e) => setForm((f) => ({ ...f, brand_name: e.target.value }))}
              placeholder="RentLoja" hint="Shown in place of “RentLoja” across the app." />

            <div className="field">
              <label>Logo</label>
              <input ref={fileRef} type="file" accept="image/*" onChange={onLogo} style={{ display: 'none' }} />
              <div className="row gap wrap">
                {form.brand_logo && <img className="logo-thumb" src={form.brand_logo} alt="logo" />}
                <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}><IconPalette size={15} /> {form.brand_logo ? 'Replace logo' : 'Upload logo'}</button>
                {form.brand_logo && <button type="button" className="btn ghost sm danger" onClick={() => setForm((f) => ({ ...f, brand_logo: null }))}><IconTrash size={14} /></button>}
              </div>
              <span className="hint">Square image works best (PNG/JPG).</span>
            </div>

            <div className="field">
              <label>Theme colour</label>
              <div className="row gap wrap" style={{ alignItems: 'center' }}>
                <input type="color" value={form.brand_color} onChange={(e) => setForm((f) => ({ ...f, brand_color: e.target.value }))}
                  style={{ width: 46, height: 40, border: '1px solid var(--line)', borderRadius: 9, background: 'var(--bg)', padding: 2, cursor: 'pointer' }} />
                <Input value={form.brand_color} onChange={(e) => setForm((f) => ({ ...f, brand_color: e.target.value }))} style={{ maxWidth: 130 }} />
                <div className="row gap">
                  {PRESET_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, brand_color: c }))}
                      title={c} style={{ width: 26, height: 26, borderRadius: 99, background: c, border: form.brand_color?.toLowerCase() === c ? '2px solid var(--text)' : '1px solid var(--line)' }} />
                  ))}
                </div>
              </div>
            </div>

            <div className="row gap" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn ghost" onClick={resetDefault} disabled={busy}>Reset to default</button>
              <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save branding'}</button>
            </div>
          </div>

          <p className="hint" style={{ marginTop: 14 }}>
            <IconUsers size={13} /> Your branding also appears in the portal your tenants use.
          </p>
        </>
      )}
    </div>
  )
}
