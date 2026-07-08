import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

// When both env vars are present we run against a real Supabase project.
// Otherwise RentPilot falls back to the localStorage demo backend (mockDb).
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null

export const DEFAULT_COUNTRY_CODE =
  import.meta.env.VITE_DEFAULT_COUNTRY_CODE?.trim() || '263'
