import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const ThemeCtx = createContext(null)
export const useTheme = () => useContext(ThemeCtx)

const KEY = 'rentflow_theme'

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try { return localStorage.getItem(KEY) || 'dark' } catch { return 'dark' }
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f3f1ea' : '#0a0908')
    try { localStorage.setItem(KEY, theme) } catch { /* ignore */ }
  }, [theme])

  const setTheme = useCallback((t) => setThemeState(t === 'light' ? 'light' : 'dark'), [])
  const toggle = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), [])

  return <ThemeCtx.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeCtx.Provider>
}
