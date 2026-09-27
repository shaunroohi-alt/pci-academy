// Environment validation. Only NEXT_PUBLIC_ values exist in the static
// bundle; server-only secrets live in Supabase Edge Function secrets and
// never reach this code.
import { z } from 'zod'

const PublicEnv = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().optional().or(z.literal('')),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional().or(z.literal('')),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  NEXT_PUBLIC_BASE_PATH: z.string().optional(),
})

const parsed = PublicEnv.safeParse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH,
})

if (!parsed.success) {
  throw new Error(`Invalid public environment: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`)
}

// A service-role key must never be bundled.
for (const key of Object.keys(process.env)) {
  if (key.startsWith('NEXT_PUBLIC_') && /SERVICE_ROLE|SECRET|API_KEY$/.test(key) && key !== 'NEXT_PUBLIC_SUPABASE_ANON_KEY') {
    throw new Error(`${key} looks like a secret and must not be exposed with NEXT_PUBLIC_.`)
  }
}

export const env = {
  appUrl: parsed.data.NEXT_PUBLIC_APP_URL || '',
  supabaseUrl: parsed.data.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  basePath: parsed.data.NEXT_PUBLIC_BASE_PATH || '',
}

export const backendConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)

/** Prefix a public asset path with the deployment base path. */
export function asset(path: string): string {
  return `${env.basePath}${path.startsWith('/') ? path : `/${path}`}`
}
