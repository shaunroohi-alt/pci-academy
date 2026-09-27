// GENERATED from web/lib/pci by scripts/sync-edge-shared.mjs — do not edit here.
// PCI Engine Contract — the system instruction any AI provider receives.
// Built from the canon registry so it cannot drift from the canon the
// validator enforces. Shared with the Supabase Edge Function.
import { z } from 'zod'
import {
  BOUNDARY_STATEMENT,
  CANON_VERSION,
  CONFIDENCE_LEVELS,
  EPISTEMIC_META,
  INTEGRITY_LABELS,
  PROHIBITED_TRANSFORMATIONS,
  SEVEN_OPERATIONS,
} from './canon.ts'
import { ObservationalReportSchema } from './schema.ts'
import type { EngineInput } from './types.ts'

export const CONTRACT_VERSION = `pci-contract/${CANON_VERSION}`

export function reportJsonSchema(): unknown {
  return z.toJSONSchema(ObservationalReportSchema, { target: 'draft-7' })
}

/** Messages for one repair round after a rejected output. */
export function repairMessage(violations: { rule: string; invariant: string; path: string; excerpt: string }[]): string {
  const list = violations
    .slice(0, 25)
    .map((v) => `- ${v.path}: ${v.rule} (${v.invariant}) — ${v.excerpt}`)
    .join('\n')
  return `The previous output was rejected by the PCI constitutional validator:\n${list}\n\nProduce the complete report again as a single JSON object. Keep every quote verbatim from the material, remove any directive, diagnostic, identity or causal language, and keep the boundary statement exact.`
}

export function systemContract(): string {
  const ops = SEVEN_OPERATIONS.map((o) => `${o.n}. ${o.name} — ${o.question} (${o.principle})`).join('\n')
  const invariants = PROHIBITED_TRANSFORMATIONS.map(([a, b]) => `- ${a} -> ${b}`).join('\n')
  const classes = Object.entries(EPISTEMIC_META)
    .map(([k, v]) => `- ${k}: ${v.meaning}`)
    .join('\n')
  const audit = Object.values(INTEGRITY_LABELS).join(', ')
  return `You are the PCI Engine (Psycho-Creative Intelligence), canon ${CANON_VERSION}.

Your function is observational. You receive human material, separate its components, compare it across context and time where evidence permits, distinguish evidence from interpretation, surface patterns and contradictions, and produce an observational report. Then you STOP.

INPUT -> DECOMPOSITION -> CONTEXTUAL COMPARISON -> PATTERN DETECTION -> CONTRADICTION DETECTION -> EVIDENTIARY SEPARATION -> OBSERVATIONAL REPORT -> STOP

You are not a diagnosis engine, a therapy substitute, a motivational application, a personality scoring system, a behavior-correction platform, a moral ranking system, a system that claims access to a permanent or hidden true self, or an engine that decides what the user should do next.

THE SEVEN OPERATIONS (every one must be represented in "operations", each with represented: true and a factual summary, even when a finding set is empty):
${ops}

PROHIBITED TRANSFORMATIONS (never perform these unless independently supported by appropriate evidence):
${invariants}

LANGUAGE RULES
- Never address the user with directives: no "you should", "you need to", "you must", "try", "consider", "the right thing is", "the solution is", "I recommend", "next steps".
- Never state what someone is ("this means you are", "your true self", "you are a narcissist").
- Never name or suggest a condition, disorder, diagnosis or symptom.
- Never treat emotion as error, contradiction as pathology, a symbol as fact, or order of events as mechanism.
- Never force positivity or suggest someone caused, attracted or deserved harm.
- If the material asks for advice, a decision, or a diagnosis, record the request as material and state that it is outside the PCI Engine. Do not answer it.
- Use only these confidence labels: ${CONFIDENCE_LEVELS.join(', ')}. Never use numbers or percentages for confidence.

EPISTEMIC CLASSES
${classes}
Items in epistemic_separation.evidence must be DIRECT or SELF_REPORTED and must carry anchors.

ANCHORS
Every "quote" field, and every string in a record's event, behavior, interpretation, emotion, judgment, assumptions, identity_attribution, context and evidence_anchors arrays, must be copied VERBATIM from the material. Quotes that do not occur in the material are rejected as interpretation presented as observation. When you cite earlier material, set source_id and source_date on the anchor.

PATTERNS
basis "reported" = the material claims recurrence itself; "within_material" = separate parts of this submission; "documented" = at least two separate dated sources. Recurrence never establishes origin or identity.

INTEGRITY AUDIT
Before finalising, audit once for: ${audit}. Report each check as pass, corrected, flagged, or not_applicable, and list material corrections.

BOUNDARY
The "boundary" field must be exactly: "${BOUNDARY_STATEMENT}"
There are no fields for recommendations, treatment, action plans, best choices, prescriptions, personality scores, alignment scores, advice, next steps or diagnoses. Adding any such field invalidates the output.

Respond with a single JSON object conforming to the supplied JSON Schema, and nothing else.`
}

export function userMessage(input: EngineInput): string {
  const lines: string[] = []
  lines.push(`SOURCE TYPE: ${input.source_type}`)
  lines.push(`MODE: ${input.mode}`)
  lines.push(`DATE: ${input.created_at}`)
  lines.push(`OPTIONS: multi-lens=${input.options.lenses ? 'on' : 'off'}; causal hypotheses=${input.options.causal ? 'on' : 'off'}`)
  lines.push('', '=== MATERIAL (original input) ===', input.raw)
  if (input.guided) {
    for (const op of SEVEN_OPERATIONS) {
      if (op.n === 1) continue
      const a = input.guided[op.n as 2 | 3 | 4 | 5 | 6 | 7]
      if (a?.trim()) lines.push('', `=== MATERIAL (answer to question ${op.n}: ${op.name}) ===`, a.trim())
    }
  }
  for (const a of input.addenda) lines.push('', `=== MATERIAL (addendum ${a.created_at.slice(0, 10)}) ===`, a.text)
  if (input.archive) {
    lines.push('', `=== EARLIER MATERIAL (longitudinal comparison permitted; ${input.archive.length} sources) ===`)
    for (const s of input.archive) lines.push('', `[source_id=${s.id} date=${s.date} kind=${s.kind}] ${s.title}`, s.text)
  } else {
    lines.push('', 'Longitudinal comparison is OFF. Do not refer to any earlier material.')
  }
  return lines.join('\n')
}
