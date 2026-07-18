import { useState, useEffect } from 'react'
import { IconDownload, IconShare, IconX } from './icons.jsx'

// "Install app" entry point for the landing screen.
//
// Chrome / Edge / Android fire `beforeinstallprompt`, which we hold onto so the
// user can install from OUR button instead of hunting through the browser menu.
// iOS Safari never fires it — installing there is a manual Share-sheet flow, so
// we show the steps instead. Once installed, the button disappears.
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

export default function InstallApp() {
  const [deferred, setDeferred] = useState(null)
  const [installed, setInstalled] = useState(isStandalone())
  const [iosHelp, setIosHelp] = useState(false)

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e) }
    const onInstalled = () => { setInstalled(true); setDeferred(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // Already running as the installed app, or a browser that can't install it.
  if (installed) return null
  if (!deferred && !isIos()) return null

  const install = async () => {
    if (!deferred) return setIosHelp(true)
    deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setDeferred(null)
  }

  return (
    <div className="install-wrap">
      <button className="install-btn" onClick={install}>
        <IconDownload size={15} />
        <span>Install app on this phone</span>
      </button>

      {iosHelp && (
        <div className="install-help">
          <button className="install-help-x" onClick={() => setIosHelp(false)} aria-label="Close"><IconX size={13} /></button>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Add RentLoja to your Home Screen</div>
          <div className="row gap" style={{ alignItems: 'flex-start' }}>
            <IconShare size={15} />
            <span>Tap <b>Share</b> at the bottom of Safari, then choose <b>Add to Home Screen</b>.</span>
          </div>
        </div>
      )}

      <style>{`
        .install-wrap { margin-top: 14px; }
        .install-btn {
          display: inline-flex; align-items: center; gap: 8px; padding: 9px 18px; border-radius: 99px;
          background: var(--gold-bg); border: 1px solid var(--gold-line); color: var(--gold);
          font-size: 0.85rem; font-weight: 600; transition: all 0.16s;
        }
        .install-btn:hover { background: var(--gold); color: #0a0908; border-color: var(--gold); }
        .install-help {
          position: relative; margin-top: 12px; text-align: left; font-size: 0.82rem;
          color: var(--text-dim); background: var(--bg-raised); border: 1px solid var(--gold-line);
          border-radius: var(--radius); padding: 13px 15px;
        }
        .install-help svg { color: var(--gold); flex-shrink: 0; margin-top: 2px; }
        .install-help-x { position: absolute; top: 9px; right: 9px; background: transparent; border: none; color: var(--text-faint); }
        .install-help-x:hover { color: var(--text); }
      `}</style>
    </div>
  )
}
