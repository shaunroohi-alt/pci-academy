// Cloudflare Worker for pci.academy. Static assets (web/out) are served as
// before; only /api/* reaches this script (run_worker_first in
// wrangler.jsonc). The Anthropic key is a Worker secret and never reaches
// the browser bundle.
import Anthropic from '@anthropic-ai/sdk'
import { hasMaterial, parseWriteRequest, writeContrary, type Generate } from './contrary.ts'

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
  ANTHROPIC_API_KEY?: string
  /** Optional override; defaults to the current Claude Opus. */
  CONTRARY_MODEL?: string
  CONTRARY_LIMITER?: RateLimiter
}

export const DEFAULT_CONTRARY_MODEL = 'claude-opus-5-5'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

// Never log user material (§9.1): only counts, rules and statuses.
const log = (event: string, data: Record<string, unknown>) => console.log(JSON.stringify({ event, ...data }))

class RefusalError extends Error {
  constructor(public category: string | null) {
    super('The model declined this material.')
  }
}

function anthropicGenerate(apiKey: string, model: string): Generate {
  const client = new Anthropic({ apiKey })
  return async ({ system, messages }) => {
    const message = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      // A declined request is re-run server-side on the model Anthropic
      // recommends for that refusal category.
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages,
    })
    if (message.stop_reason === 'refusal') throw new RefusalError(message.stop_details?.category ?? null)
    return message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
  }
}

async function contrary(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  const origin = request.headers.get('Origin')
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: 'Forbidden.' }, 403)
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'The writer is not configured for this site yet.' }, 501)

  if (env.CONTRARY_LIMITER) {
    const key = request.headers.get('CF-Connecting-IP') ?? 'anon'
    const { success } = await env.CONTRARY_LIMITER.limit({ key })
    if (!success) return json({ error: 'Too many requests. Wait a minute and try again.' }, 429)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON.' }, 400)
  }
  const req = parseWriteRequest(body)
  if (!req) return json({ error: 'The session could not be read.' }, 400)
  if (!hasMaterial(req.steps, req.step)) return json({ error: 'Write at least one earlier step first.' }, 400)

  try {
    const r = await writeContrary(anthropicGenerate(env.ANTHROPIC_API_KEY, env.CONTRARY_MODEL || DEFAULT_CONTRARY_MODEL), req)
    log('contrary_written', { step: req.step, rounds: r.rounds, violations: r.violations.map((v) => v.rule), chars: r.text.length })
    if (!r.text) return json({ error: 'The writer returned nothing. Try again.' }, 502)
    return json({ text: r.text, violations: r.violations })
  } catch (e) {
    if (e instanceof RefusalError) {
      log('contrary_refused', { category: e.category })
      return json({ error: 'The writer declined this material.' }, 422)
    }
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'The writer is busy. Try again shortly.' }, 429)
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      log('contrary_auth_error', {})
      return json({ error: 'The writer is misconfigured.' }, 500)
    }
    if (e instanceof Anthropic.APIError) {
      log('contrary_provider_error', { status: e.status })
      return json({ error: 'The writer is unavailable right now.' }, 502)
    }
    log('contrary_error', { message: e instanceof Error ? e.message.slice(0, 200) : 'unknown' })
    return json({ error: 'Writing failed.' }, 500)
  }
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === '/api/contrary' || pathname === '/api/contrary/') return contrary(request, env)
    if (pathname.startsWith('/api/')) return json({ error: 'Not found.' }, 404)
    return env.ASSETS.fetch(request)
  },
}

export default worker
