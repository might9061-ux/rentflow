import { Component } from 'react'

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
    // In production this is where you'd report to Sentry/Logflare etc.
    console.error('RentLoja caught an error:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
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
