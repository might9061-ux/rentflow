// Picks the payment adapter for a workspace by the provider on its
// payment_credentials. Paynow and Pesepay share the same interface
// (initiate / poll / parseResult / credentialsFor), so the routes stay
// provider-agnostic. Defaults to Paynow when unset.
import { admin } from '../supabase.js'
import * as paynow from './paynow.js'
import * as pesepay from './pesepay.js'

export async function adapterFor(managerId) {
  const { data } = await admin.from('payment_credentials').select('provider').eq('manager_id', managerId).maybeSingle()
  return data?.provider === 'pesepay' ? pesepay : paynow
}
