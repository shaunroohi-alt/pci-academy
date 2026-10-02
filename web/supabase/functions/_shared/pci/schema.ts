// GENERATED from web/lib/pci by scripts/sync-edge-shared.mjs — do not edit here.
// PCI observation schema (§7.4). Strict objects: an engine output carrying
// any field not defined here — recommendation, treatment, action_plan,
// best_choice, behavioral_prescription, personality_score, alignment_score —
// fails validation by construction.
import { z } from 'zod'
import {
  BOUNDARY_STATEMENT,
  CONFIDENCE_LEVELS,
  CONTRADICTION_CLASSES,
  EPISTEMIC_CLASSES,
  INTEGRITY_CHECKS,
  LENSES,
  PATTERN_ADOPTION_STAGES,
  RELATIONSHIP_TYPES,
  SOURCE_TYPES,
  TEMPORAL_CLASSES,
} from './canon.ts'

export const EpistemicClassSchema = z.enum(EPISTEMIC_CLASSES)
export const ConfidenceSchema = z.enum(CONFIDENCE_LEVELS)
export const SourceTypeSchema = z.enum(SOURCE_TYPES)

/** A verbatim quotation from the user's material. Validated against the input. */
export const AnchorSchema = z.strictObject({
  quote: z.string(),
  record_id: z.string().optional(),
  source_id: z.string().optional(),
  source_date: z.string().optional(),
})
export type Anchor = z.infer<typeof AnchorSchema>

export const StructuredRecordSchema = z.strictObject({
  id: z.string().regex(/^OBS-\d{3,}$/),
  source_type: SourceTypeSchema,
  time_reference: z.string(),
  event: z.array(z.string()),
  behavior: z.array(z.string()),
  interpretation: z.array(z.string()),
  emotion: z.array(z.string()),
  judgment: z.array(z.string()),
  assumptions: z.array(z.string()),
  identity_attribution: z.array(z.string()),
  context: z.array(z.string()),
  /** Engine-authored: what is absent, inaccessible, ambiguous or unknowable. */
  unknown_variables: z.array(z.string()),
  evidence_anchors: z.array(z.string()),
})
export type StructuredRecord = z.infer<typeof StructuredRecordSchema>

export const DecompositionItemSchema = z.strictObject({
  id: z.string(),
  /** Verbatim fragment of the material ('' for engine-identified unknowns). */
  quote: z.string(),
  /** Engine-authored clarification. Subject to the constitutional validator. */
  note: z.string().optional(),
  epistemic_class: EpistemicClassSchema,
  record_id: z.string().optional(),
  subject: z.enum(['self', 'other', 'situation', 'unspecified']).optional(),
})
export type DecompositionItem = z.infer<typeof DecompositionItemSchema>

export const DecompositionSchema = z.strictObject({
  events: z.array(DecompositionItemSchema),
  behaviors: z.array(DecompositionItemSchema),
  interpretations: z.array(DecompositionItemSchema),
  emotions: z.array(DecompositionItemSchema),
  judgments: z.array(DecompositionItemSchema),
  assumptions: z.array(DecompositionItemSchema),
  expectations: z.array(DecompositionItemSchema),
  identity_attributions: z.array(DecompositionItemSchema),
  context: z.array(DecompositionItemSchema),
  unknowns: z.array(DecompositionItemSchema),
})
export type Decomposition = z.infer<typeof DecompositionSchema>

export const ContextualComparisonSchema = z.strictObject({
  id: z.string(),
  scope: z.enum(['within_material', 'archive']),
  compared: z.tuple([z.string(), z.string()]),
  description: z.string(),
  constants: z.array(z.string()),
  changed_conditions: z.array(z.string()),
  context_sensitive: z.array(z.string()),
  context_invariant: z.array(z.string()),
  missing_variables: z.array(z.string()),
  anchors: z.array(AnchorSchema),
  epistemic_class: EpistemicClassSchema,
  confidence: ConfidenceSchema,
})
export type ContextualComparison = z.infer<typeof ContextualComparisonSchema>

export const TemporalFindingSchema = z.strictObject({
  id: z.string(),
  temporal_class: z.enum(TEMPORAL_CLASSES),
  description: z.string(),
  anchors: z.array(AnchorSchema),
  first_observed: z.string().optional(),
  last_observed: z.string().optional(),
  epistemic_class: EpistemicClassSchema,
  confidence: ConfidenceSchema,
})
export type TemporalFinding = z.infer<typeof TemporalFindingSchema>

export const PatternSchema = z.strictObject({
  id: z.string(),
  description: z.string(),
  /** 'reported' = the material itself claims recurrence ("always", "again");
   *  'within_material' = the same structure appears in separate parts of one submission;
   *  'documented' = recurrence is visible across separate, dated material. */
  basis: z.enum(['reported', 'within_material', 'documented']),
  occurrences: z.array(AnchorSchema),
  conditions: z.array(z.string()),
  temporal_class: z.enum(TEMPORAL_CLASSES).optional(),
  epistemic_class: EpistemicClassSchema,
  confidence: ConfidenceSchema,
})
export type Pattern = z.infer<typeof PatternSchema>

export const ComparedDimensionSchema = z.enum(['same', 'different', 'unknown'])

export const ContradictionSchema = z.strictObject({
  id: z.string(),
  contradiction_class: z.enum(CONTRADICTION_CLASSES),
  description: z.string(),
  a: AnchorSchema,
  b: AnchorSchema,
  compared_on: z.strictObject({
    subject: ComparedDimensionSchema,
    meaning: ComparedDimensionSchema,
    scope: ComparedDimensionSchema,
    time: ComparedDimensionSchema,
    context: ComparedDimensionSchema,
    observer: ComparedDimensionSchema,
  }),
  status: z.enum(['unresolved', 'revised']),
  epistemic_class: EpistemicClassSchema,
  confidence: ConfidenceSchema,
})
export type Contradiction = z.infer<typeof ContradictionSchema>

export const OBSERVER_DIMENSIONS = [
  'observed_event',
  'observer_position',
  'attention_selection',
  'perceptual_frame',
  'interpretive_frame',
  'expectation',
  'meaning_assignment',
  'observer_identity_involvement',
  'state_dependency',
  'self_observation',
  'feedback_loop',
] as const

export const ObserverFindingSchema = z.strictObject({
  id: z.string(),
  dimension: z.enum(OBSERVER_DIMENSIONS),
  description: z.string(),
  anchors: z.array(AnchorSchema),
  epistemic_class: EpistemicClassSchema,
})
export type ObserverFinding = z.infer<typeof ObserverFindingSchema>

export const RelationalFindingSchema = z.strictObject({
  id: z.string(),
  relationship: z.enum(RELATIONSHIP_TYPES),
  from: z.string(),
  to: z.string(),
  description: z.string(),
  anchors: z.array(AnchorSchema),
  epistemic_class: EpistemicClassSchema,
  confidence: ConfidenceSchema,
})
export type RelationalFinding = z.infer<typeof RelationalFindingSchema>

export const PatternAdoptionSchema = z.strictObject({
  id: z.string(),
  pattern_id: z.string(),
  description: z.string(),
  stages: z.array(
    z.strictObject({
      stage: z.enum(PATTERN_ADOPTION_STAGES),
      evidenced: z.boolean(),
      note: z.string(),
      anchors: z.array(AnchorSchema),
    }),
  ),
  origin_note: z.string(),
})
export type PatternAdoption = z.infer<typeof PatternAdoptionSchema>

export const LensFindingSchema = z.strictObject({
  id: z.string(),
  description: z.string(),
  anchors: z.array(AnchorSchema),
  epistemic_class: EpistemicClassSchema,
})

export const LensReportSchema = z.strictObject({
  lenses: z.array(
    z.strictObject({
      lens: z.enum(LENSES.map((l) => l.key) as [string, ...string[]]),
      label: z.string(),
      findings: z.array(LensFindingSchema),
    }),
  ),
  comparison: z.strictObject({
    convergence: z.array(z.string()),
    divergence: z.array(z.string()),
    orthogonality: z.array(z.string()),
    epistemic_asymmetry: z.array(z.string()),
  }),
})
export type LensReport = z.infer<typeof LensReportSchema>

export const CausalHypothesisSchema = z.strictObject({
  id: z.string(),
  observed_sequence: z.string(),
  candidate_mechanism: z.string(),
  supporting_evidence: z.array(AnchorSchema),
  alternative_mechanisms: z.array(z.string()),
  disconfirming_evidence: z.array(z.string()),
  epistemic_class: z.literal('SPECULATIVE'),
  confidence: ConfidenceSchema,
})
export type CausalHypothesis = z.infer<typeof CausalHypothesisSchema>

export const EpistemicItemSchema = z.strictObject({
  id: z.string(),
  epistemic_class: EpistemicClassSchema,
  statement: z.string(),
  anchors: z.array(AnchorSchema),
})
export type EpistemicItem = z.infer<typeof EpistemicItemSchema>

export const EpistemicSeparationSchema = z.strictObject({
  evidence: z.array(EpistemicItemSchema),
  interpretation: z.array(EpistemicItemSchema),
  inference: z.array(EpistemicItemSchema),
  hypothesis: z.array(EpistemicItemSchema),
  symbolic: z.array(EpistemicItemSchema),
  philosophical: z.array(EpistemicItemSchema),
  unknown: z.array(EpistemicItemSchema),
})
export type EpistemicSeparation = z.infer<typeof EpistemicSeparationSchema>

export const IntegrityAuditSchema = z.strictObject({
  checks: z.array(
    z.strictObject({
      check: z.enum(INTEGRITY_CHECKS),
      result: z.enum(['pass', 'corrected', 'flagged', 'not_applicable']),
      note: z.string(),
    }),
  ),
  corrections: z.array(z.string()),
})
export type IntegrityAudit = z.infer<typeof IntegrityAuditSchema>

export const VisibleStatementSchema = z.strictObject({
  id: z.string(),
  statement: z.string(),
  supports: z.array(z.string()),
})
export type VisibleStatement = z.infer<typeof VisibleStatementSchema>

export const OperationCoverageSchema = z.strictObject({
  represented: z.boolean(),
  summary: z.string(),
})

export const ObservationalReportSchema = z.strictObject({
  observed_material: z.strictObject({
    source_type: SourceTypeSchema,
    mode: z.enum(['guided', 'direct']),
    characters: z.number().int().nonnegative(),
    record_count: z.number().int().nonnegative(),
    addenda: z.number().int().nonnegative(),
    longitudinal: z.boolean(),
    compared_sources: z.number().int().nonnegative(),
  }),
  records: z.array(StructuredRecordSchema),
  decomposition: DecompositionSchema,
  contextual_comparison: z.array(ContextualComparisonSchema),
  temporal: z.array(TemporalFindingSchema),
  patterns: z.array(PatternSchema),
  pattern_adoption: z.array(PatternAdoptionSchema),
  contradictions: z.array(ContradictionSchema),
  observer: z.array(ObserverFindingSchema),
  relational: z.array(RelationalFindingSchema),
  lens_report: LensReportSchema.optional(),
  causal_hypotheses: z.array(CausalHypothesisSchema).optional(),
  epistemic_separation: EpistemicSeparationSchema,
  integrity_audit: IntegrityAuditSchema,
  what_became_visible: z.array(VisibleStatementSchema),
  operations: z.strictObject({
    input: OperationCoverageSchema,
    decomposition: OperationCoverageSchema,
    contextual_comparison: OperationCoverageSchema,
    pattern_detection: OperationCoverageSchema,
    contradiction_detection: OperationCoverageSchema,
    evidentiary_separation: OperationCoverageSchema,
    observational_report: OperationCoverageSchema,
  }),
  boundary: z.literal(BOUNDARY_STATEMENT),
})
export type ObservationalReport = z.infer<typeof ObservationalReportSchema>

// ── Persistence objects (§7.5 Immutable Evidence / Revisable Analysis) ────

export const GuidedAnswersSchema = z.strictObject({
  1: z.string(),
  2: z.string().optional(),
  3: z.string().optional(),
  4: z.string().optional(),
  5: z.string().optional(),
  6: z.string().optional(),
  7: z.string().optional(),
})
export type GuidedAnswers = z.infer<typeof GuidedAnswersSchema>

export const SourceRefSchema = z.strictObject({
  kind: z.enum(['journal', 'ledger', 'contrary', 'lesson']),
  id: z.string(),
  label: z.string().optional(),
})
export type SourceRef = z.infer<typeof SourceRefSchema>

/** Raw input. Written once; never updated. */
export const ObservationInputSchema = z.strictObject({
  id: z.string(),
  created_at: z.string(),
  source_type: SourceTypeSchema,
  mode: z.enum(['guided', 'direct']),
  title: z.string(),
  raw: z.string().min(1),
  guided_answers: GuidedAnswersSchema.optional(),
  source_ref: SourceRefSchema.optional(),
  content_hash: z.string(),
})
export type ObservationInput = z.infer<typeof ObservationInputSchema>

/** New information after the original input. Also immutable once written. */
export const ObservationAddendumSchema = z.strictObject({
  id: z.string(),
  observation_id: z.string(),
  created_at: z.string(),
  text: z.string().min(1),
})
export type ObservationAddendum = z.infer<typeof ObservationAddendumSchema>

export const ViolationSchema = z.strictObject({
  rule: z.string(),
  invariant: z.string(),
  path: z.string(),
  excerpt: z.string(),
})
export type Violation = z.infer<typeof ViolationSchema>

export const AnalysisVersionSchema = z.strictObject({
  id: z.string(),
  observation_id: z.string(),
  version: z.number().int().positive(),
  created_at: z.string(),
  provider: z.string(),
  model: z.string(),
  engine_version: z.string(),
  canon_version: z.string(),
  status: z.enum(['valid', 'quarantined']),
  report: ObservationalReportSchema.optional(),
  violations: z.array(ViolationSchema),
  addenda_included: z.array(z.string()),
  longitudinal: z.boolean(),
  options: z.strictObject({ lenses: z.boolean(), causal: z.boolean() }),
  /** The observation and analysis written as prose for the user to read. Optional: older versions have none. */
  writeup: z
    .strictObject({
      observation: z.string(),
      analysis: z.string(),
      model: z.string(),
      violations: z.array(ViolationSchema),
    })
    .optional(),
  /** Why no write-up was produced for this version, when one was attempted. */
  writeup_error: z.string().optional(),
})
export type AnalysisVersion = z.infer<typeof AnalysisVersionSchema>

/** Fields that must never exist anywhere in PCI engine output (§7.4). */
export const FORBIDDEN_FIELDS = [
  'recommendation',
  'recommendations',
  'treatment',
  'action_plan',
  'best_choice',
  'behavioral_prescription',
  'personality_score',
  'alignment_score',
  'advice',
  'next_steps',
  'diagnosis',
  'score',
] as const

// ── Engine request (validated server-side before any model call) ───────
export const ArchiveSourceSchema = z.strictObject({
  id: z.string().max(200),
  kind: z.enum(['observation', 'journal', 'ledger', 'contrary']),
  date: z.string().max(40),
  title: z.string().max(300),
  text: z.string().max(20000),
})

export const EngineInputSchema = z.strictObject({
  raw: z.string().min(1).max(50000),
  addenda: z.array(z.strictObject({ id: z.string().max(200), text: z.string().max(20000), created_at: z.string().max(40) })).max(50),
  guided: GuidedAnswersSchema.optional(),
  source_type: SourceTypeSchema,
  mode: z.enum(['guided', 'direct']),
  created_at: z.string().max(40),
  archive: z.array(ArchiveSourceSchema).max(200).optional(),
  options: z.strictObject({ lenses: z.boolean(), causal: z.boolean() }),
})
