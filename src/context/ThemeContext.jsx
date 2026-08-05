import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const ThemeCtx = createContext(null)
export const useTheme = () => useContext(ThemeCtx)

const KEY = 'rentflow_theme'
const SIZE_KEY = 'rentflow_text_size'

// Pinch-zoom is disabled in the installed app (it breaks sticky headers and the
// lock screen), so this is how people make text bigger instead. Scales every
// rem-based size via --font-scale on <html>.
export const TEXT_SIZES = [
  { id: 'small',   label: 'Small',   scale: 0.9 },
  { id: 'default', label: 'Default', scale: 1 },
  { id: 'large',   label: 'Large',   scale: 1.15 },
  { id: 'xlarge',  label: 'Largest', scale: 1.3 },
]
const scaleFor = (id) => (TEXT_SIZES.find((s) => s.id === id) || TEXT_SIZES[1]).scale

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try { return localStorage.getItem(KEY) || 'light' } catch { return 'light' }
  })
  const [textSize, setTextSizeState] = useState(() => {
    try { return localStorage.getItem(SIZE_KEY) || 'default' } catch { return 'default' }
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#eef2f7' : '#0d131c')
    try { localStorage.setItem(KEY, theme) } catch { /* ignore */ }
  }, [theme])

  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', String(scaleFor(textSize)))
    try { localStorage.setItem(SIZE_KEY, textSize) } catch { /* ignore */ }
  }, [textSize])

  const setTheme = useCallback((t) => setThemeState(t === 'light' ? 'light' : 'dark'), [])
  const toggle = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), [])
  const setTextSize = useCallback((id) => setTextSizeState(TEXT_SIZES.some((s) => s.id === id) ? id : 'default'), [])

  return <ThemeCtx.Provider value={{ theme, setTheme, toggle, textSize, setTextSize }}>{children}</ThemeCtx.Provider>
}
