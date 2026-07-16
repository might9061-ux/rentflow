// Thin labelled wrappers around inputs/selects/textareas.
import { useState } from 'react'
import { IconEye, IconEyeOff } from './icons.jsx'
import { isValidEmail, suggestEmailDomain } from '../lib/validate.js'

export function Field({ label, hint, error, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {error ? <span className="hint" style={{ color: 'var(--danger)' }}>{error}</span>
        : hint ? <span className="hint">{hint}</span> : null}
    </div>
  )
}

export function Input({ label, hint, error, ...props }) {
  return (
    <Field label={label} hint={hint} error={error}>
      <input className="input" {...props} />
    </Field>
  )
}

// Password field with a show/hide (eye) toggle.
export function PasswordInput({ label, hint, error, ...props }) {
  const [show, setShow] = useState(false)
  return (
    <Field label={label} hint={hint} error={error}>
      <div className="pw-wrap">
        <input className="input" type={show ? 'text' : 'password'} {...props} />
        <button type="button" className="pw-toggle" tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
          onClick={() => setShow((s) => !s)}>
          {show ? <IconEyeOff size={17} /> : <IconEye size={17} />}
        </button>
      </div>
    </Field>
  )
}

// Email field with format validation + a "did you mean" typo catcher
// (e.g. gmial.com → gmail.com), shown once the field has been touched.
export function EmailInput({ label, hint, value, onChange, ...props }) {
  const [touched, setTouched] = useState(false)
  const invalid = touched && value && !isValidEmail(value)
  const suggestion = touched && value && isValidEmail(value) ? suggestEmailDomain(value) : null
  const shownHint = suggestion
    ? (
      <>
        Did you mean{' '}
        <button type="button" className="link-btn" style={{ fontWeight: 600 }}
          onClick={() => onChange({ target: { value: suggestion } })}>{suggestion}</button>?
      </>
    )
    : hint
  return (
    <Field label={label} hint={shownHint} error={invalid ? 'Enter a valid email like name@example.com' : undefined}>
      <input className="input" type="email" inputMode="email" autoCapitalize="off" autoCorrect="off" spellCheck={false}
        value={value} onChange={onChange} onBlur={() => setTouched(true)}
        pattern="[^\s@]+@[^\s@]+\.[^\s@]+" title="Enter a valid email like name@example.com" {...props} />
    </Field>
  )
}

export function Textarea({ label, hint, error, ...props }) {
  return (
    <Field label={label} hint={hint} error={error}>
      <textarea className="textarea" {...props} />
    </Field>
  )
}

export function Select({ label, hint, error, children, ...props }) {
  return (
    <Field label={label} hint={hint} error={error}>
      <select className="select" {...props}>{children}</select>
    </Field>
  )
}

export function Row({ children }) {
  return <div className="field-row">{children}</div>
}
