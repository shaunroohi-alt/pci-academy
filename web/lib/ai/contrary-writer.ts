import { asset } from '@/lib/env'
import type { ContraryStepKey } from '@/lib/pci/canon'

export type WritableContraryStep = Extract<ContraryStepKey, 'contrary_position' | 'balance'>

export const isWritableStep = (step: ContraryStepKey): step is WritableContraryStep => step === 'contrary_position' || step === 'balance'

export interface ContraryDraft {
  text: string
  /** Boundary rules the draft still crosses after repair; shown, not hidden. */
  violations: { rule: string; excerpt: string }[]
}

/**
 * Asks the site's Worker (/api/contrary) to write the Contrary Position or
 * the Balance from the session so far. The session text leaves the device
 * and is sent to Claude (Anthropic).
 */
export async function writeContraryStep(step: WritableContraryStep, steps: Partial<Record<ContraryStepKey, string>>, title?: string): Promise<ContraryDraft> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Writing needs a connection.')
  let res: Response
  try {
    res = await fetch(asset('/api/contrary'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step, steps, title }),
    })
  } catch {
    throw new Error('The writer could not be reached.')
  }
  const data = (await res.json().catch(() => null)) as { text?: string; violations?: ContraryDraft['violations']; error?: string } | null
  if (!res.ok || !data?.text) {
    if (res.status === 404 && !data?.error) throw new Error('The writer is not available on this deployment.')
    throw new Error(data?.error ?? 'Writing failed.')
  }
  return { text: data.text, violations: data.violations ?? [] }
}
