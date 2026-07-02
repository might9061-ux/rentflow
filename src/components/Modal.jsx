import { useEffect, useRef } from 'react'
import { IconX } from './icons.jsx'

export default function Modal({ title, children, onClose, footer, wide = false }) {
  // Only close when the press STARTS and ENDS on the backdrop itself — so
  // selecting text in a field (and releasing on the backdrop) never closes it.
  const downOnBackdrop = useRef(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  return (
    <div className="modal-overlay"
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget }}
      onMouseUp={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget) onClose?.(); downOnBackdrop.current = false }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="x-btn" onClick={onClose} aria-label="Close"><IconX size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}
