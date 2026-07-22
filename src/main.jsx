import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { ToastProvider } from './context/ToastContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'

// Vercel Analytics reports the URL of every page view. Our URLs carry things
// that must not leave the app, so they're cleaned before anything is sent:
//
//   /manager/tenants/<uuid>      → a real tenant's id
//   /tenant/messages?q=<text>    → the tenant's actual question to the Copilot
//
// Stripping them is also what makes the numbers readable: without it every
// tenant is a separate "page" and the report is noise.
function scrubUrl(rawUrl) {
  try {
    const u = new URL(rawUrl)
    u.pathname = u.pathname
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/[id]')
      // Fall back to masking any long id-ish segment we didn't anticipate.
      .replace(/\/[0-9a-z]{16,}/gi, '/[id]')
    u.search = ''   // never report query strings
    u.hash = ''
    return u.toString()
  } catch {
    return rawUrl
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <ToastProvider>
            <AuthProvider>
              <App />
              <Analytics beforeSend={(e) => ({ ...e, url: scrubUrl(e.url) })} />
            </AuthProvider>
          </ToastProvider>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
)

// Register the service worker so RentLoja is installable as a home-screen app.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore */ })
  })
}
