import { supabase } from '@/lib/supabase/client'
import { hashedEmbedding } from '@/lib/pci/vector'
import type { EngineInput } from '@/lib/pci/types'
import type { PCIProvider } from './provider'

/**
 * Remote provider: the Supabase Edge Function `pci-analyze`, which holds the
 * AI key server-side, applies the PCI contract, validates, and returns the
 * output. The client pipeline validates again before anything is shown.
 */
export function remoteProvider(model = 'configured on server'): PCIProvider {
  return {
    id: 'remote',
    label: 'PCI Engine (AI provider)',
    model,
    description:
      'Sends the material over an encrypted connection to the PCI Engine service, which calls the configured language model under the PCI contract. Output is validated on the server and again on this device.',
    capabilities: { analyze: true, embed: false, summarize: false, transcribe: false, synthesizeSpeech: false, offline: false, sendsMaterial: true },
    async analyze(input: EngineInput) {
      const sb = supabase()
      if (!sb) throw new Error('The PCI Engine service is not configured for this deployment.')
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('AI analysis needs a connection. The local engine works offline.')
      const { data, error } = await sb.functions.invoke('pci-analyze', { body: { action: 'analyze', input } })
      if (error) throw new Error(error.message)
      if (!data || typeof data !== 'object' || !('output' in data)) throw new Error('The PCI Engine service returned no output.')
      return (data as { output: unknown }).output
    },
    async embed(texts) {
      return texts.map((t) => hashedEmbedding(t))
    },
    async summarize(text) {
      return text.slice(0, 280)
    },
  }
}

export async function remoteStatus(): Promise<{ available: boolean; provider?: string; model?: string; reason?: string }> {
  const sb = supabase()
  if (!sb) return { available: false, reason: 'No backend is configured for this deployment.' }
  try {
    const { data, error } = await sb.functions.invoke('pci-analyze', { body: { action: 'health' } })
    if (error) return { available: false, reason: error.message }
    const d = data as { configured?: boolean; provider?: string; model?: string }
    return d.configured ? { available: true, provider: d.provider, model: d.model } : { available: false, reason: 'No AI provider is configured on the server.' }
  } catch (e) {
    return { available: false, reason: e instanceof Error ? e.message : 'Unavailable.' }
  }
}
