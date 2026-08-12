import { Component } from 'react'
import * as Sentry from '@sentry/react'
import { isChunkLoadError, reloadForStaleBuild } from '../lib/appUpdate.js'

// Catches unexpected render errors so the app shows a recoverable message
// instead of a blank screen.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // A failed chunk import means a new version was deployed while this device
    // held the old one — not a bug. Reload once to get the fresh build instead
    // of showing a scary crash screen. If the reload was suppressed (we already
    // tried seconds ago, so this is NOT a stale build), fall through to the
    // normal crash path rather than an eternal "Updating…" screen.
    if (isChunkLoadError(error)) {
      if (reloadForStaleBuild()) return
      this.setState({ reloadSuppressed: true })
    }
    // Report the render crash to Sentry (no-op until VITE_SENTRY_DSN is set),
    // with the React component stack for context.
    Sentry.captureException(error, { extra: { componentStack: info?.componentStack } })
    console.error('RentLoja caught an error:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    // Stale-build reload is already in flight (from componentDidCatch) — show a
    // neutral "updating" note, not the crash card.
    if (isChunkLoadError(this.state.error) && !this.state.reloadSuppressed) {
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <div className="muted" style={{ textAlign: 'center' }}>Updating RentLoja…</div>
        </div>
      )
    }
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="card pad" style={{ maxWidth: 440, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>⚠️</div>
          <h2 style={{ fontSize: '1.5rem' }}>Something went wrong</h2>
          <p className="muted" style={{ margin: '8px 0 18px' }}>
            An unexpected error occurred. Reloading usually fixes it.
          </p>
          <button className="btn primary" onClick={() => { window.location.href = '/' }}>
            Reload RentLoja
          </button>
        </div>
      </div>
    )
  }
}
