import { useRef } from 'react'

// 6-digit OTP input with auto-advance, backspace, and paste support.
export default function OtpInput({ value = '', onChange, length = 6 }) {
  const refs = useRef([])
  const chars = value.padEnd(length).slice(0, length).split('')

  const setAt = (i, v) => {
    const arr = value.padEnd(length).slice(0, length).split('')
    arr[i] = v
    onChange(arr.join('').replace(/\s/g, ''))
  }

  const handleChange = (i, e) => {
    const v = e.target.value.replace(/\D/g, '')
    if (!v) { setAt(i, ' '); return }
    const digit = v[v.length - 1]
    setAt(i, digit)
    if (i < length - 1) refs.current[i + 1]?.focus()
  }

  const handleKey = (i, e) => {
    if (e.key === 'Backspace' && !chars[i].trim() && i > 0) {
      refs.current[i - 1]?.focus()
    }
  }

  const handlePaste = (e) => {
    const txt = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, length)
    if (txt) { e.preventDefault(); onChange(txt); refs.current[Math.min(txt.length, length - 1)]?.focus() }
  }

  return (
    <div className="otp" onPaste={handlePaste}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          inputMode="numeric"
          maxLength={1}
          value={chars[i].trim()}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKey(i, e)}
          autoFocus={i === 0}
        />
      ))}
    </div>
  )
}
