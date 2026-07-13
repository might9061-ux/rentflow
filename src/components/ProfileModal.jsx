import { useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { db } from '../lib/db.js'
import { fileToAvatar } from '../lib/upload.js'
import { fullName, initials } from '../lib/format.js'
import { prettyPhone } from '../lib/phone.js'
import Modal from './Modal.jsx'
import { IconMail, IconPhone, IconKey, IconLogout, IconTrash, IconSun, IconMoon } from './icons.jsx'

// "My profile" — view your details and set a profile picture. Works for the
// manager (owner/agent) and the tenant.
export default function ProfileModal({ role, onClose, onChangePassword }) {
  const { userId, profile, refresh, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const toast = useToast()
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)

  const roleLabel = role === 'tenant' ? 'Tenant' : profile?.role === 'staff' ? 'Agent' : 'Manager'

  const saveAvatar = async (avatar) => {
    setBusy(true)
    try {
      if (role === 'tenant') await db.updateTenant(userId, { avatar })
      else await db.updateManagerSettings(userId, { avatar })
      await refresh()
      toast.success(avatar ? 'Profile photo updated' : 'Photo removed')
    } catch (e) { toast.error('Could not save', e.message) }
    finally { setBusy(false) }
  }
  const onFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    try { saveAvatar(await fileToAvatar(f)) } catch (err) { toast.error('Upload failed', err.message) }
  }

  return (
    <Modal title="My profile" onClose={onClose} footer={<button className="btn ghost" onClick={onClose}>Done</button>}>
      <div className="center" style={{ flexDirection: 'column', gap: 12, marginBottom: 18 }}>
        <div style={{ position: 'relative' }}>
          {profile?.avatar
            ? <img src={profile.avatar} alt="" style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--line)' }} />
            : <div className="avatar" style={{ width: 96, height: 96, fontSize: '2rem' }}>{initials(profile?.first_name, profile?.last_name)}</div>}
          <button type="button" className="pfp-cam" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Change photo">📷</button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: '1.15rem', fontFamily: 'var(--serif)' }}>{fullName(profile)}</div>
          <span className="pill neutral" style={{ marginTop: 4 }}>{roleLabel}</span>
        </div>
      </div>

      <div className="pf-box">
        <div className="pf-row"><span className="row gap muted"><IconMail size={15} /> Email</span><b>{profile?.email}</b></div>
        {profile?.phone && <div className="pf-row"><span className="row gap muted"><IconPhone size={15} /> Phone</span><b>{prettyPhone(profile.phone)}</b></div>}
        <div className="pf-row">
          <span className="row gap muted">{theme === 'dark' ? <IconMoon size={15} /> : <IconSun size={15} />} Appearance</span>
          <button className="btn ghost sm" onClick={toggle}>{theme === 'dark' ? 'Dark' : 'Light'} — switch to {theme === 'dark' ? 'light' : 'dark'}</button>
        </div>
      </div>

      <div className="row gap wrap" style={{ marginTop: 16 }}>
        <button className="btn ghost sm" onClick={() => fileRef.current?.click()} disabled={busy}>{profile?.avatar ? 'Change photo' : 'Add photo'}</button>
        {profile?.avatar && <button className="btn ghost sm danger" onClick={() => saveAvatar(null)} disabled={busy}><IconTrash size={14} /> Remove</button>}
        {onChangePassword && <button className="btn ghost sm" onClick={() => { onClose(); onChangePassword() }}><IconKey size={14} /> Change password</button>}
        <button className="btn ghost sm" onClick={signOut}><IconLogout size={14} /> Sign out</button>
      </div>

      <style>{`
        .pfp-cam { position: absolute; bottom: -4px; right: -4px; width: 32px; height: 32px; border-radius: 99px;
          background: linear-gradient(180deg, var(--accent-soft), var(--accent)); color: #14110b; border: 2px solid var(--surface); cursor: pointer; font-size: 14px; }
        .pf-box { border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
        .pf-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; border-bottom: 1px solid var(--line-soft); }
        .pf-row:last-child { border-bottom: none; }
      `}</style>
    </Modal>
  )
}
