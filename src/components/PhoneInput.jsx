import { useState, useRef, useEffect } from 'react'
import { Field } from './Field.jsx'
import { COUNTRY_CODES, splitPhone, joinPhone } from '../lib/phone.js'
import { IconChevron } from './icons.jsx'

// Phone field with an all-countries flag + dial-code picker (searchable).
// Emits the combined E.164-ish value (+<dial><local>) to onChange.
export default function PhoneInput({ label = 'Phone', value, onChange, required, hint, error, placeholder = '77 123 4567' }) {
  const init = splitPhone(value)
  const [dial, setDial] = useState(init.dial)
  const [local, setLocal] = useState(init.local)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)
  const searchRef = useRef(null)

  const current = COUNTRY_CODES.find((c) => c.dial === dial) || COUNTRY_CODES.find((c) => c.code === 'ZW') || COUNTRY_CODES[0]
  const emit = (d, l) => onChange?.(joinPhone(d, l))

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  useEffect(() => { if (open) setTimeout(() => searchRef.current?.focus(), 30) }, [open])

  const filtered = COUNTRY_CODES.filter((c) => {
    const q = query.trim().toLowerCase()
    return !q || c.name.toLowerCase().includes(q) || c.dial.includes(q.replace('+', '')) || c.code.toLowerCase() === q
  })

  const pick = (c) => { setDial(c.dial); setOpen(false); setQuery(''); emit(c.dial, local) }

  return (
    <Field label={label} hint={hint} error={error}>
      <div className="phone-input" ref={ref}>
        <div className="cc">
          <button type="button" className="cc-btn" onClick={() => setOpen((o) => !o)} aria-label="Choose country code">
            <span className="cc-flag">{current?.flag}</span>
            <span className="mono">+{dial}</span>
            <IconChevron size={13} className="cc-caret" />
          </button>
          {open && (
            <div className="cc-menu">
              <input ref={searchRef} className="input cc-search" placeholder="Search country or code…"
                value={query} onChange={(e) => setQuery(e.target.value)} />
              <div className="cc-list">
                {filtered.map((c) => (
                  <button type="button" key={c.code || c.dial} className={`cc-item ${c.dial === dial ? 'on' : ''}`} onClick={() => pick(c)}>
                    <span className="cc-flag">{c.flag}</span>
                    <span className="cc-name">{c.name}</span>
                    <span className="muted mono">+{c.dial}</span>
                  </button>
                ))}
                {filtered.length === 0 && <div className="cc-empty muted">No match</div>}
              </div>
            </div>
          )}
        </div>
        <input className="input" type="tel" inputMode="tel" placeholder={placeholder} required={required}
          value={local} onChange={(e) => { const l = e.target.value.replace(/[^\d ]/g, ''); setLocal(l); emit(dial, l) }} />
      </div>
    </Field>
  )
}
