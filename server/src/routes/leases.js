// Lease agreements. Managers generate or upload a lease and send it to a tenant;
// the tenant reads it and e-signs. Signing goes through the server (service role)
// so a tenant can only set the signature, never alter the terms.
import { Router } from 'express'
import { h, ok, ownerId } from '../auth.js'
import { admin } from '../supabase.js'

const router = Router()

// Fields a manager may set on a lease (never manager_id/signature/status-jump).
const FIELDS = ['tenant_id', 'property_id', 'kind', 'rent', 'deposit', 'currency',
  'start_date', 'end_date', 'due_day', 'term_months', 'terms', 'document_url', 'file_name',
  'manager_signed_name', 'manager_signed_at']
const pick = (b) => Object.fromEntries(FIELDS.filter((k) => k in (b || {})).map((k) => [k, b[k]]))

// GET /api/leases?tenant_id= — leases in the caller's workspace (optionally one tenant's).
router.get('/', h(async (req, res) => {
  let q = req.db.from('leases').select('*').order('created_at', { ascending: false })
  if (req.query.tenant_id) q = q.eq('tenant_id', req.query.tenant_id)
  res.json(ok(await q))
}))

// GET /api/leases/mine — the signed-in tenant's own leases.
router.get('/mine', h(async (req, res) => {
  res.json(ok(await req.db.from('leases').select('*')
    .eq('tenant_id', req.user.id).order('created_at', { ascending: false })))
}))

// POST /api/leases — a manager creates & sends a lease.
router.post('/', h(async (req, res) => {
  const manager_id = await ownerId(req)
  const row = { ...pick(req.body), manager_id, status: req.body?.status === 'draft' ? 'draft' : 'sent', sent_at: new Date().toISOString() }
  if (!row.tenant_id) throw new Error('Choose the tenant this lease is for.')
  res.json(ok(await req.db.from('leases').insert(row).select().single()))
}))

// PATCH /api/leases/:id — edit a lease (terms/file/status).
router.patch('/:id', h(async (req, res) => {
  const patch = pick(req.body)
  if (req.body?.status && ['draft', 'sent'].includes(req.body.status)) patch.status = req.body.status
  res.json(ok(await req.db.from('leases').update(patch).eq('id', req.params.id).select().single()))
}))

// DELETE /api/leases/:id
router.delete('/:id', h(async (req, res) => {
  ok(await req.db.from('leases').delete().eq('id', req.params.id))
  res.json({ deleted: true })
}))

// POST /api/leases/:id/sign — the tenant accepts & signs. We verify ownership
// and set ONLY the signature fields with the service role.
router.post('/:id/sign', h(async (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) throw new Error('Type your full name to sign.')
  const lease = ok(await admin.from('leases').select('id, tenant_id, status').eq('id', req.params.id).single())
  if (lease.tenant_id !== req.user.id) return res.status(403).json({ error: 'Not your lease.' })
  if (lease.status === 'signed') return res.json(ok(await admin.from('leases').select('*').eq('id', lease.id).single()))
  res.json(ok(await admin.from('leases')
    .update({ status: 'signed', signed_name: name, signed_at: new Date().toISOString() })
    .eq('id', lease.id).select().single()))
}))

export default router
