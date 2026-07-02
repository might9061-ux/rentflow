import { createContext, useContext, useState, useCallback } from 'react'

const ToastCtx = createContext(null)
export const useToast = () => useContext(ToastCtx)

let nextId = 1

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const push = useCallback((toast) => {
    const id = nextId++
    const t = { id, type: 'info', duration: 4200, ...toast }
    setToasts((cur) => [...cur, t])
    if (t.duration) setTimeout(() => dismiss(id), t.duration)
    return id
  }, [dismiss])

  const api = {
    toast: push,
    success: (title, message) => push({ type: 'success', title, message }),
    error: (title, message) => push({ type: 'error', title, message, duration: 6000 }),
    info: (title, message) => push({ type: 'info', title, message }),
  }

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`} onClick={() => dismiss(t.id)}>
            <div className="t-bar" />
            <div>
              <div className="t-title">{t.title}</div>
              {t.message && <div className="t-msg">{t.message}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
