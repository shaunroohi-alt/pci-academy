// PCI Engine — local implementation of the internal processing order (§2.1):
// Intake → Records → Decomposition → Temporal → Context Differential →
// Contradiction → Pattern Adoption → Observer/Observed → Relational →
// Multi-Lens (optional) → Epistemic Classification → Confidence →
// Integrity Audit → Observational Report → STOP.
//
// Deterministic and offline. Advanced layers are omitted when the material
// is insufficient rather than populated speculatively.
import { BOUNDARY_STATEMENT, SEVEN_OPERATIONS } from './canon.ts'
import { causalHypotheses } from './causal.ts'
import { archiveComparisons, matchArchive, relationalFindings } from './comparison.ts'
import { contextDifferential } from './context.ts'
import { archiveContradictions, detectContradictions } from './contradictions.ts'
import { decompose, type MaterialPart } from './decomposition.ts'
import { separate } from './epistemic.ts'
import { integrityAudit, type DraftReport } from './integrity.ts'
import { lensReport } from './lenses.ts'
import { observerFindings } from './observer.ts'
import { documentedPatterns, reportedPatterns, withinMaterialPatterns } from './patterns.ts'
import { operationsCoverage, visibleStatements } from './report.ts'
import { ObservationalReportSchema, type ObservationalReport } from './schema.ts'
import { temporalFindings } from './temporal.ts'
import type { EngineInput } from './types.ts'

export function materialParts(input: EngineInput): MaterialPart[] {
  const parts: MaterialPart[] = [{ id: 'input', label: 'Original input', text: input.raw, source_type: input.source_type }]
  if (input.mode === 'guided' && input.guided) {
    for (const op of SEVEN_OPERATIONS) {
      if (op.n === 1) continue
      const answer = input.guided[op.n as 2 | 3 | 4 | 5 | 6 | 7]
      if (answer?.trim()) parts.push({ id: `guided-${op.n}`, label: `Answer to question ${op.n} (${op.name})`, text: answer.trim(), source_type: 'statement' })
    }
  }
  for (const a of input.addenda) parts.push({ id: a.id, label: `Addendum ${a.created_at.slice(0, 10)}`, text: a.text, source_type: input.source_type })
  return parts
}

/** All text the engine was given, for anchor verification. */
export function materialText(input: EngineInput): string {
  return materialParts(input)
    .map((p) => p.text)
    .join('\n')
}

export function analyzeLocally(input: EngineInput): ObservationalReport {
  const d = decompose(materialParts(input))
  const archive = input.archive ?? []
  const longitudinal = input.archive !== undefined
  const matches = longitudinal ? matchArchive(d, archive) : []

  const withinComparisons = contextDifferential(d)
  const archiveComps = archiveComparisons(d, matches, input.created_at)
  const temporal = temporalFindings(d, matches, input.created_at)
  const documented = documentedPatterns(d, matches, input.created_at)
  const patterns = [...reportedPatterns(d), ...withinMaterialPatterns(d), ...documented.map((x) => x.pattern)]
  const within = detectContradictions(d)
  const contradictions = [...within, ...(longitudinal ? archiveContradictions(d, matches.map((m) => m.source), within.length) : [])]
  const observer = observerFindings(d)
  const relational = relationalFindings(d, matches, input.created_at)
  const causal = input.options.causal ? causalHypotheses(d, matches.map((m) => m.source)) : []
  const comparisons = [...withinComparisons, ...archiveComps]

  const epistemic_separation = separate({ d, patterns, comparisons, contradictions, temporal, observer, causal })

  const base = {
    observed_material: {
      source_type: input.source_type,
      mode: input.mode,
      characters: d.material.length,
      record_count: d.records.length,
      addenda: input.addenda.length,
      longitudinal,
      compared_sources: matches.length,
    },
    records: d.records,
    decomposition: d.decomposition,
    contextual_comparison: comparisons,
    temporal,
    patterns,
    pattern_adoption: documented.map((x) => x.adoption),
    contradictions,
    observer,
    relational,
    ...(input.options.lenses ? { lens_report: lensReport(d) } : {}),
    ...(input.options.causal ? { causal_hypotheses: causal } : {}),
    epistemic_separation,
  }
  const what_became_visible = visibleStatements(d, base)
  const withVisible = { ...base, what_became_visible }
  const draft: DraftReport = {
    ...withVisible,
    operations: operationsCoverage(d, withVisible, longitudinal),
    boundary: BOUNDARY_STATEMENT,
  }

  const { report, audit } = integrityAudit(draft, { material: d.material, archiveTexts: matches.map((m) => m.source.text) })
  // Coverage is recomputed after the audit so counts reflect the corrected report.
  const final = { ...report, operations: operationsCoverage(d, report, longitudinal), integrity_audit: audit }
  return ObservationalReportSchema.parse(final)
}
