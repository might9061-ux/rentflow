import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { db } from '../lib/db.js'
import Modal from './Modal.jsx'
import { PasswordInput } from './Field.jsx'

// In-app password change for a signed-in manager or tenant.
export default function ChangePasswordModal({ onClose }) {
  const { userId } = useAuth()
  const toast = useToast()
  const [cur, setCur] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (pw.length < 6) return toast.error('Too short', 'Use at least 6 characters.')
    if (pw !== pw2) return toast.error('Passwords don’t match')
    setBusy(true)
    try {
      await db.changePassword(userId, cur, pw)
      toast.success('Password changed', 'Use your new password next time you sign in.')
      onClose()
    } catch (err) { toast.error('Could not change password', err.message); setBusy(false) }
  }

  return (
    <Modal title="Change password" onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" form="cp-form" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
      </>}>
      <p className="muted" style={{ marginBottom: 16 }}>
        Confirm your current password, then choose a new one.
      </p>
      <form id="cp-form" onSubmit={submit}>
        <PasswordInput label="Current password" value={cur} onChange={(e) => setCur(e.target.value)} required autoFocus
          autoComplete="current-password" />
        <PasswordInput label="New password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6}
          autoComplete="new-password" />
        <PasswordInput label="Confirm new password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={6}
          autoComplete="new-password" />
      </form>
    </Modal>
  )
}
