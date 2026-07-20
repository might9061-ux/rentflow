// Audit trail for privileged (App-owner) actions.
//
// Written with the service role — the table has no insert policy, so this is
// the only way in and the record can't be altered afterwards by whoever is
// being audited.
//
// Logging must never break the action it describes: a failure here is reported
// to the server console and swallowed, so a full audit table (or a hiccup)
// can't stop a landlord's plan being switched on.
import { admin } from '../supabase.js'

export async function logAdmin(req, action, { targetId, targetEmail, details } = {}) {
  try {
    await admin.from('admin_audit').insert({
      actor_id: req?.user?.id || null,
      actor_email: req?.user?.email || null,
      action,
      target_id: targetId || null,
      target_email: targetEmail || null,
      details: details || null,
    })
  } catch (e) {
    console.error('[audit] could not record', action, '-', e?.message || e)
  }
}
