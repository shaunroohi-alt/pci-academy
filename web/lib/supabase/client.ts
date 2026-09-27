import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { backendConfigured, env } from '@/lib/env'

let client: SupabaseClient | null = null

/** Browser Supabase client (anon key; Row-Level Security enforces ownership). */
export function supabase(): SupabaseClient | null {
  if (!backendConfigured) return null
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  }
  return client
}
