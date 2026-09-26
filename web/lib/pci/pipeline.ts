// Processing pipeline (§8.2):
// User Material → PCI Engine Contract → AI Provider → Structured Schema
// Validation → PCI Constitutional Validator → Meta-Observational Integrity
// Audit → Observational Report → (Persistence, by the caller).
import { CANON_VERSION, ENGINE_VERSION } from './canon.ts'
import { integrityAudit } from './integrity.ts'
import { materialText } from './engine.ts'
import { ObservationalReportSchema, type AnalysisVersion, type ObservationalReport, type Violation } from './schema.ts'
import type { EngineInput } from './types.ts'
import { validateOutput } from './validator.ts'

export interface AnalyzeCapable {
  id: string
  model: string
  analyze(input: EngineInput): Promise<unknown>
}

export type PipelineResult = Omit<AnalysisVersion, 'id' | 'observation_id' | 'version' | 'created_at'>

export async function runPipeline(provider: AnalyzeCapable, input: EngineInput): Promise<PipelineResult> {
  const material = materialText(input)
  const archive = input.archive ? Object.fromEntries(input.archive.map((s) => [s.id, s.text])) : undefined
  const base = {
    provider: provider.id,
    model: provider.model,
    engine_version: ENGINE_VERSION,
    canon_version: CANON_VERSION,
    addenda_included: input.addenda.map((a) => a.id),
    longitudinal: input.archive !== undefined,
    options: { lenses: input.options.lenses, causal: input.options.causal },
  }

  let raw: unknown
  try {
    raw = await provider.analyze(input)
  } catch (err) {
    throw new PipelineError(err instanceof Error ? err.message : 'The analysis provider did not respond.')
  }

  const violations: Violation[] = []
  const parsed = ObservationalReportSchema.safeParse(raw)
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 20)) {
      violations.push({ rule: 'schema.invalid', invariant: 'structured output', path: `$.${issue.path.join('.')}`, excerpt: issue.message })
    }
    // Scan the raw output too, so forbidden fields and prescriptive language are named.
    violations.push(...validateOutput(raw, { material, archive }).violations)
    return { ...base, status: 'quarantined', violations }
  }

  let report: ObservationalReport = parsed.data
  if (provider.id !== 'local') {
    // External output gets its own audit; the local engine has already run one.
    const { integrity_audit: providerAudit, ...draft } = report
    const { report: audited, audit } = integrityAudit(draft, { material, archiveTexts: input.archive?.map((a) => a.text) ?? [] })
    report = {
      ...audited,
      integrity_audit: { checks: audit.checks, corrections: [...providerAudit.corrections, ...audit.corrections] },
    }
  }

  const result = validateOutput(report, { material, archive })
  if (!result.ok) return { ...base, status: 'quarantined', violations: result.violations }
  return { ...base, status: 'valid', report, violations: [] }
}

export class PipelineError extends Error {}
