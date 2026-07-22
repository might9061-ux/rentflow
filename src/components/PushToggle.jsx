// Switch for pop-up (Web Push) notifications on THIS device.
//
// Permission is per-device, not per-account, so this reads the browser's live
// state every time it mounts rather than trusting a saved preference — someone
// who turned notifications off in their phone settings must see the switch
// turned off here too.
import { useEffect, useState, useCallback } from 'react'
import { useToast } from '../context/ToastContext.jsx'
import { pushSupported, pushStatus, enablePush, disablePush, sendTestPush } from '../lib/push.js'
import { IconBell } from './icons.jsx'

export default function PushToggle({ blurb }) {
  const toast = useToast()
  const [state, setState] = useState(null)   // null = still checking
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => { setState(await pushStatus()) }, [])
  useEffect(() => { refresh() }, [refresh])

  if (state === null) return null

  // Nothing actionable on this device — say why instead of showing a dead switch.
  if (!state.supported) {
    return (
      <div className="card pad push-card">
        <div className="row gap" style={{ alignItems: 'flex-start' }}>
          <span className="muted"><IconBell size={16} /></span>
          <div>
            <div style={{ fontWeight: 600 }}>Pop-up notifications</div>
            <p className="muted" style={{ fontSize: '0.84rem', marginTop: 3 }}>{state.reason}</p>
          </div>
        </div>
        <style>{PUSH_CSS}</style>
      </div>
    )
  }

  const toggle = async () => {
    setBusy(true)
    try {
      if (state.enabled) {
        await disablePush()
        toast.info('Pop-up notifications off', 'You’ll still see notices inside the app.')
      } else {
        await enablePush()
        toast.success('Pop-up notifications on', 'This device will now alert you like any other app.')
      }
      await refresh()
    } catch (e) {
      toast.error('Could not change that', e.message)
      await refresh()   // permission may have changed even though we failed
    } finally { setBusy(false) }
  }

  const test = async () => {
    setBusy(true)
    try {
      const { sent } = await sendTestPush()
      if (sent > 0) toast.success('Sent', `Check for the pop-up on ${sent === 1 ? 'this device' : `your ${sent} devices`}.`)
      else toast.error('Nothing sent', 'No device is registered for pop-ups yet.')
    } catch (e) { toast.error('Test failed', e.message) }
    finally { setBusy(false) }
  }

  const blocked = state.permission === 'denied'

  return (
    <div className="card pad push-card">
      <div className="spread wrap" style={{ gap: 12 }}>
        <div className="row gap" style={{ alignItems: 'flex-start', minWidth: 0 }}>
          <span style={{ color: state.enabled ? 'var(--green)' : 'var(--muted)' }}><IconBell size={16} /></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>Pop-up notifications</div>
            <p className="muted" style={{ fontSize: '0.84rem', marginTop: 3 }}>
              {blocked
                ? 'Blocked for RentLoja. Allow notifications in your browser or phone settings, then come back.'
                : blurb || 'Get an alert on this device the moment something arrives — even when RentLoja is closed.'}
            </p>
          </div>
        </div>
        {!blocked && (
          <label className="switch" style={{ flexShrink: 0 }}>
            <input type="checkbox" checked={state.enabled} disabled={busy} onChange={toggle} />
            <span className="track" />
          </label>
        )}
      </div>

      {state.enabled && (
        <button className="btn sm ghost" style={{ marginTop: 12 }} disabled={busy} onClick={test}>
          Send a test notification
        </button>
      )}
      <style>{PUSH_CSS}</style>
    </div>
  )
}

const PUSH_CSS = `.push-card { margin-bottom: 16px; }`
