import { asset } from '@/lib/env'
import { SEVEN_OPERATIONS, SOURCE_TYPE_LABELS } from '@/lib/pci/canon'
import type { AnalysisVersion, ObservationalReport } from '@/lib/pci/schema'
import type { EngineInput } from '@/lib/pci/types'

export type Writeup = NonNullable<AnalysisVersion['writeup']>
export type ReflectionWriter = (input: EngineInput, report: ObservationalReport) => Promise<Writeup>

/** The request the site's Worker (/api/reflect) writes from: the material, the engine's findings, and permitted earlier material. */
export function reflectRequest(input: EngineInput, report: ObservationalReport) {
  const parts = [{ label: 'Original input', text: input.raw }]
  if (input.mode === 'guided' && input.guided) {
    for (const op of SEVEN_OPERATIONS) {
      if (op.n === 1) continue
      const a = input.guided[op.n as 2 | 3 | 4 | 5 | 6 | 7]
      if (a?.trim()) parts.push({ label: `Answer to "${op.question}"`, text: a.trim() })
    }
  }
  for (const a of input.addenda) parts.push({ label: `Added ${a.created_at.slice(0, 10)}`, text: a.text })

  const findings = [
    ...report.what_became_visible.map((v) => v.statement),
    ...report.patterns.map((p) => p.description),
    ...report.temporal.map((t) => t.description),
  ]
  // Only the earlier sources the engine actually compared against.
  const cited = new Set([...JSON.stringify(report).matchAll(/"source_id":"([^"]+)"/g)].map((m) => m[1]))
  const earlier = (input.archive ?? [])
    .filter((s) => cited.has(s.id))
    .slice(-8)
    .map((s) => ({ date: s.date, title: s.title, text: s.text }))

  return { kind: SOURCE_TYPE_LABELS[input.source_type] ?? input.source_type, parts, findings: [...new Set(findings)], ...(earlier.length ? { earlier } : {}) }
}

/**
 * Asks the site's Worker to write the observation and analysis as prose.
 * The material leaves the device and is sent to Claude (Anthropic).
 */
export const writeReflection: ReflectionWriter = async (input, report) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Writing needs a connection.')
  let res: Response
  try {
    res = await fetch(asset('/api/reflect'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reflectRequest(input, report)),
    })
  } catch {
    throw new Error('The writer could not be reached.')
  }
  const data = (await res.json().catch(() => null)) as (Partial<Writeup> & { error?: string }) | null
  if (!res.ok || !data?.observation || !data.analysis) {
    if (res.status === 404 && !data?.error) throw new Error('The writer is not available on this deployment.')
    throw new Error(data?.error ?? 'Writing failed.')
  }
  return { observation: data.observation, analysis: data.analysis, model: data.model ?? 'claude', violations: data.violations ?? [] }
}
