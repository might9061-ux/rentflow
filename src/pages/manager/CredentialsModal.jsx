import { useAuth } from '../../context/AuthContext.jsx'
import Modal from '../../components/Modal.jsx'
import { sendWhatsApp, credentialsMessage } from '../../lib/whatsapp.js'
import { prettyPhone } from '../../lib/phone.js'
import { IconWhatsapp, IconKey, IconMail } from '../../components/icons.jsx'

// Shown after creating a tenant or resending credentials. Lets the manager
// forward the login details to the tenant via a pre-filled WhatsApp message.
export default function CredentialsModal({ tenant, tempPassword, onClose }) {
  const { profile } = useAuth()

  const share = () => {
    const message = credentialsMessage({ tenant, manager: profile, tempPassword, appUrl: window.location.origin })
    sendWhatsApp(tenant.phone, message)
  }

  return (
    <Modal title="Tenant credentials" onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Done</button>
        <button className="btn wa" onClick={share}><IconWhatsapp size={16} /> Send via WhatsApp</button>
      </>}>
      <p className="muted" style={{ marginBottom: 18 }}>
        Account ready for <b style={{ color: 'var(--text)' }}>{tenant.first_name} {tenant.last_name}</b>.
        Share these one-time details — they’ll verify and set their own password on first login.
      </p>

      <div className="cred-box">
        <div className="cred-row"><span className="row gap muted"><IconMail size={15} /> Email</span><b>{tenant.email}</b></div>
        <div className="cred-row"><span className="row gap muted"><IconKey size={15} /> Temp password</span>
          <b className="mono" style={{ color: 'var(--gold)', letterSpacing: 1 }}>{tempPassword}</b></div>
        <div className="cred-row"><span className="row gap muted"><IconWhatsapp size={15} /> WhatsApp</span><b>{prettyPhone(tenant.phone)}</b></div>
      </div>

      <p className="hint" style={{ marginTop: 14 }}>
        Tip: WhatsApp opens with the message pre-filled — just press send. The link uses the tenant’s number in
        international format (+263).
      </p>

      <style>{`
        .cred-box { border:1px solid var(--line); border-radius:var(--radius); overflow:hidden; }
        .cred-row { display:flex; justify-content:space-between; align-items:center; padding:13px 16px; border-bottom:1px solid var(--line-soft); }
        .cred-row:last-child { border-bottom:none; }
      `}</style>
    </Modal>
  )
}
