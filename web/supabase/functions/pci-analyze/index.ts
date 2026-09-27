// PCI Engine service (Supabase Edge Function).
//
// Holds the AI provider key server-side. For each request it authenticates
// the caller, checks the observe entitlement, validates the request, calls
// the model under the PCI contract with the report schema as structured
// output, validates the result (schema + constitutional validator), allows
// one repair round, and returns the output. The app validates it again and
// quarantines anything that still crosses the boundary.
//
// Actions: health · analyze · delete_account
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { analyzeWithRepair } from '../_shared/analyze.ts'
import { adapterFromEnv, OutputLimitError, RefusalError } from '../_shared/model.ts'
import { EngineInputSchema } from '../_shared/pci/schema.ts'

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Never log user material (§9.1): only counts, rules and statuses.
const log = (event: string, data: Record<string, unknown>) => console.log(JSON.stringify({ event, ...data }))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const authorization = req.headers.get('Authorization') ?? ''
  const sb = createClient(url, anon, { global: { headers: { Authorization: authorization } } })
  const { data: auth } = await sb.auth.getUser()
  const user = auth.user
  if (!user) return json({ error: 'Sign in required.' }, 401)

  let body: { action?: string; input?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON.' }, 400)
  }

  const adapter = adapterFromEnv(Deno.env)

  if (body.action === 'health') {
    return json({ configured: Boolean(adapter), provider: adapter?.provider ?? null, model: adapter?.model ?? null })
  }

  if (body.action === 'delete_account') {
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) return json({ error: error.message }, 500)
    log('account_deleted', {})
    return json({ deleted: true })
  }

  if (body.action !== 'analyze') return json({ error: 'Unknown action.' }, 400)
  if (!adapter) return json({ error: 'No AI provider is configured for the PCI Engine service.' }, 501)

  // Entitlements are enforced server-side (§17 R5).
  const { data: allowed } = await sb.rpc('has_entitlement', { p_flag: 'observe.basic' })
  if (allowed !== true) return json({ error: 'Your plan does not include PCI analysis.' }, 403)

  const parsed = EngineInputSchema.safeParse(body.input)
  if (!parsed.success) return json({ error: 'The material could not be accepted.', issues: parsed.error.issues.slice(0, 5).map((i) => i.path.join('.')) }, 400)
  const input = parsed.data

  try {
    const r = await analyzeWithRepair(adapter, input)
    log('analyzed', { provider: adapter.provider, model: r.servedBy, rounds: r.rounds, violations: r.violations.map((v) => v.rule), chars: input.raw.length, archive: input.archive?.length ?? 0 })
    return json({ output: r.output, provider: adapter.provider, model: r.servedBy, server_violations: r.violations })
  } catch (e) {
    if (e instanceof RefusalError) {
      log('refused', { category: e.category })
      return json({ error: 'The AI provider declined this material. The local engine can still observe it.', category: e.category }, 422)
    }
    if (e instanceof OutputLimitError) return json({ error: e.message }, 502)
    if (e instanceof SyntaxError) return json({ error: 'The provider returned output that was not valid JSON.' }, 502)
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'The PCI Engine service is busy. Try again shortly.' }, 429)
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      log('provider_auth_error', {})
      return json({ error: 'The PCI Engine service is misconfigured.' }, 500)
    }
    if (e instanceof Anthropic.APIError) {
      log('provider_error', { status: e.status })
      return json({ error: 'The AI provider is unavailable.' }, 502)
    }
    log('error', { message: e instanceof Error ? e.message.slice(0, 200) : 'unknown' })
    return json({ error: 'Analysis failed.' }, 500)
  }
})
