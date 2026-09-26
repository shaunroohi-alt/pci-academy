// Server-side model adapters for the PCI Engine. PCI is not hard-wired to a
// provider (§8.1): an adapter turns (contract, material, schema) into one
// JSON object. The PCI contract, schema and validator stay the same whichever
// adapter runs. Add another provider by implementing ModelAdapter.
import Anthropic from '@anthropic-ai/sdk'

export interface ModelTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface ModelResult {
  json: unknown
  text: string
  servedBy: string
}

export interface ModelAdapter {
  provider: string
  model: string
  generate(args: { system: string; messages: ModelTurn[]; schema: unknown }): Promise<ModelResult>
}

export class RefusalError extends Error {
  constructor(public category: string | null) {
    super('The model declined this material.')
  }
}

export class OutputLimitError extends Error {}

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5'

export function anthropicAdapter(apiKey: string, model = DEFAULT_ANTHROPIC_MODEL): ModelAdapter {
  const client = new Anthropic({ apiKey })
  return {
    provider: 'anthropic',
    model,
    async generate({ system, messages, schema }) {
      // Streamed so a long report does not hit HTTP timeouts; the SDK
      // assembles the final message.
      const stream = client.beta.messages.stream({
        model,
        max_tokens: 64000,
        betas: ['server-side-fallback-2026-07-01'],
        // A declined request is re-run server-side on the model Anthropic
        // recommends for that refusal category.
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high', format: { type: 'json_schema', schema: schema as Record<string, unknown> } },
        // The contract is identical on every call, so it is cached.
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages,
      })
      const message = await stream.finalMessage()
      if (message.stop_reason === 'refusal') throw new RefusalError(message.stop_details?.category ?? null)
      if (message.stop_reason === 'max_tokens') throw new OutputLimitError('The report exceeded the output limit.')
      const text = message.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
      return { json: JSON.parse(text), text, servedBy: message.model }
    },
  }
}

export function adapterFromEnv(env: { get(k: string): string | undefined }): ModelAdapter | null {
  const provider = (env.get('AI_PROVIDER') ?? 'anthropic').toLowerCase()
  const key = env.get('AI_API_KEY')
  if (!key) return null
  if (provider === 'anthropic') return anthropicAdapter(key, env.get('AI_MODEL') || DEFAULT_ANTHROPIC_MODEL)
  return null
}
