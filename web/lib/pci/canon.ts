// PCI canon registry — the single source of truth for engine behaviour and
// interface language. Everything here is transcribed from the Consolidated
// Blueprint, canon version 2026.09.25. Changing this file is a canon change:
// it needs author approval and a new CANON_VERSION (see §1.4).
//
// This module must stay dependency-free and use relative `.ts` imports only,
// because it is shared verbatim with the Supabase Edge Function (Deno).

export const CANON_VERSION = '2026.09.25'
export const ENGINE_VERSION = 'pci-engine/1.1.0'

export const BOUNDARY_STATEMENT =
  'PCI boundary reached: the report ends at observation. No prescription is generated.'

export const CORE_BOUNDARY = 'Visibility is the output. Human choice begins outside the PCI Engine.'

export const ARCHITECTURAL_TEST =
  'Does this feature make available material more visible, or does it begin deciding what the material requires the person to do?'

export const CANONICAL_PIPELINE = [
  'Input',
  'Decomposition',
  'Contextual Comparison',
  'Pattern Detection',
  'Contradiction Detection',
  'Evidentiary Separation',
  'Observational Report',
  'STOP',
] as const

export const INTERNAL_PIPELINE = [
  'Intake',
  'Structured Observation Records',
  'Decomposition',
  'Temporal Intelligence',
  'Context Differential',
  'Contradiction Engine',
  'Pattern Adoption & Maintenance',
  'Observer / Observed Intelligence',
  'Relational Knowledge Graph',
  'Multi-Lens Analysis when relevant',
  'Epistemic Classification',
  'Confidence Calibration',
  'Meta-Observational Integrity Audit',
  'Observational Report',
  'STOP',
] as const

// ── Canon governance (§1.4) ───────────────────────────────────────────────
export const CANON_STATUSES = [
  'canonical',
  'derived',
  'extended',
  'provisional',
  'external_comparison',
  'contradictory',
  'deprecated',
] as const
export type CanonStatus = (typeof CANON_STATUSES)[number]

export const CANON_STATUS_META: Record<CanonStatus, { label: string; meaning: string }> = {
  canonical: { label: 'Canonical', meaning: 'Explicitly established PCI doctrine or terminology.' },
  derived: { label: 'Derived', meaning: 'Follows from canonical principles but is not independently canonical.' },
  extended: { label: 'Extended', meaning: 'Deliberately expands an established canonical concept.' },
  provisional: { label: 'Provisional', meaning: 'Proposed but not yet sufficiently integrated or tested.' },
  external_comparison: {
    label: 'External comparison',
    meaning: 'Belongs to another framework and is used comparatively.',
  },
  contradictory: { label: 'Contradictory', meaning: 'Conflicts with current canon as written.' },
  deprecated: { label: 'Deprecated', meaning: 'Former PCI framing intentionally superseded by a newer version.' },
}

// ── The seven principles / operations (§2) ────────────────────────────────
export type OperationKey =
  | 'input'
  | 'decomposition'
  | 'contextual_comparison'
  | 'pattern_detection'
  | 'contradiction_detection'
  | 'evidentiary_separation'
  | 'observational_report'

export interface Operation {
  n: 1 | 2 | 3 | 4 | 5 | 6 | 7
  key: OperationKey
  name: string
  question: string
  principle: string
  active: true
}

export const SEVEN_OPERATIONS: readonly Operation[] = [
  {
    n: 1,
    key: 'input',
    name: 'Input',
    question: 'What actually occurred, or what material is present, before I explain what it means?',
    principle: 'Preserve the raw material before explanation.',
    active: true,
  },
  {
    n: 2,
    key: 'decomposition',
    name: 'Decomposition',
    question:
      'What parts of this are event, behavior, interpretation, emotion, judgment, assumption, context, identity attribution, and unknown?',
    principle: 'Separate categories that are commonly experienced as a single narrative.',
    active: true,
  },
  {
    n: 3,
    key: 'contextual_comparison',
    name: 'Contextual Comparison',
    question:
      'Where has something structurally similar appeared before, and what was the same or different about the context?',
    principle: 'Compare without treating similarity as causation or sameness.',
    active: true,
  },
  {
    n: 4,
    key: 'pattern_detection',
    name: 'Pattern Detection',
    question: 'What appears to repeat across the available material, and under what conditions does that repetition appear?',
    principle: 'Report recurrence without converting it into identity.',
    active: true,
  },
  {
    n: 5,
    key: 'contradiction_detection',
    name: 'Contradiction Detection',
    question:
      'What parts of the available material appear inconsistent, incompatible, revised, or unresolved when compared with one another?',
    principle: 'Expose tension without forcing resolution.',
    active: true,
  },
  {
    n: 6,
    key: 'evidentiary_separation',
    name: 'Evidentiary Separation',
    question:
      'What is directly evidenced here, what is interpreted or inferred, what remains hypothetical or symbolic, and what is presently unknown?',
    principle: 'Protect epistemic classes.',
    active: true,
  },
  {
    n: 7,
    key: 'observational_report',
    name: 'Observational Report',
    question:
      'After separating all of this material, what can actually be observed without deciding what I should think, become, choose, or do?',
    principle: 'Return visibility and stop.',
    active: true,
  },
] as const

// The previous twelve-question architecture is superseded (§ Document Control).
// It is retained only as a deprecated registry entry so the change is traceable.
export const DEPRECATED_ARCHITECTURES = [
  {
    key: 'twelve_question_architecture',
    label: 'Previous 12-question architecture',
    canon_status: 'deprecated' as CanonStatus,
    active: false,
    superseded_by: 'Seven Principles / Questions',
    superseded_in: CANON_VERSION,
  },
] as const

// ── Constitutional invariants (§2.2) ──────────────────────────────────────
export const PROHIBITED_TRANSFORMATIONS: readonly [string, string][] = [
  ['correlation', 'causation'],
  ['sequence', 'mechanism'],
  ['recurrence', 'origin'],
  ['similarity', 'transmission'],
  ['behavior', 'permanent identity'],
  ['identity language', 'ontology'],
  ['interpretation', 'direct observation'],
  ['symbol', 'fact'],
  ['philosophical coherence', 'empirical proof'],
  ['confidence', 'certainty'],
  ['contradiction', 'pathology'],
  ['emotion', 'error'],
  ['pattern', 'diagnosis'],
  ['visibility', 'obligation'],
  ['observation', 'prescription'],
]

// ── Epistemic classes (§4.6) ──────────────────────────────────────────────
export const EPISTEMIC_CLASSES = [
  'DIRECT',
  'SELF_REPORTED',
  'INFERRED',
  'PATTERN_SUPPORTED',
  'INTERPRETIVE',
  'SYMBOLIC',
  'PHILOSOPHICAL',
  'SPECULATIVE',
  'UNKNOWN',
] as const
export type EpistemicClass = (typeof EPISTEMIC_CLASSES)[number]

/** User-facing buckets of the Epistemic Ledger (§7.4 epistemic_separation). */
export const EPISTEMIC_BUCKETS = [
  'evidence',
  'interpretation',
  'inference',
  'hypothesis',
  'symbolic',
  'philosophical',
  'unknown',
] as const
export type EpistemicBucket = (typeof EPISTEMIC_BUCKETS)[number]

export const EPISTEMIC_META: Record<EpistemicClass, { label: string; meaning: string; bucket: EpistemicBucket }> = {
  DIRECT: { label: 'Direct', meaning: 'Explicitly present in supplied material.', bucket: 'evidence' },
  SELF_REPORTED: {
    label: 'Self-reported',
    meaning: 'Evidence that an internal state, motive, memory, or event was reported; not external verification.',
    bucket: 'evidence',
  },
  INFERRED: { label: 'Inferred', meaning: 'Reasonable interpretation supported but not directly established.', bucket: 'inference' },
  PATTERN_SUPPORTED: {
    label: 'Pattern-supported',
    meaning: 'Inference supported across multiple materially relevant observations.',
    bucket: 'inference',
  },
  INTERPRETIVE: { label: 'Interpretive', meaning: 'Conceptual frame used to organize material.', bucket: 'interpretation' },
  SYMBOLIC: {
    label: 'Symbolic',
    meaning: 'Metaphorical, mythological, archetypal, artistic, dream-based, or symbolic reading.',
    bucket: 'symbolic',
  },
  PHILOSOPHICAL: {
    label: 'Philosophical',
    meaning: 'Proposition about meaning, ontology, consciousness, agency, identity, or existence.',
    bucket: 'philosophical',
  },
  SPECULATIVE: { label: 'Speculative', meaning: 'Possible explanation with limited support.', bucket: 'hypothesis' },
  UNKNOWN: { label: 'Unknown', meaning: 'Cannot presently be established.', bucket: 'unknown' },
}

export const EPISTEMIC_BUCKET_LABELS: Record<EpistemicBucket, string> = {
  evidence: 'Evidence',
  interpretation: 'Interpretation',
  inference: 'Inference',
  hypothesis: 'Hypothesis',
  symbolic: 'Symbolic',
  philosophical: 'Philosophical',
  unknown: 'Unknown',
}

// ── Confidence calibration (§4.7) — categorical, never numeric ────────────
export const CONFIDENCE_LEVELS = [
  'High Support',
  'Moderate Support',
  'Limited Support',
  'Insufficient Evidence',
  'Undetermined',
] as const
export type Confidence = (typeof CONFIDENCE_LEVELS)[number]

// ── Decomposition categories (§2 Q2, §7.4) ────────────────────────────────
export const DECOMPOSITION_CATEGORIES = [
  'events',
  'behaviors',
  'interpretations',
  'emotions',
  'judgments',
  'assumptions',
  'expectations',
  'identity_attributions',
  'context',
  'unknowns',
] as const
export type DecompositionCategory = (typeof DECOMPOSITION_CATEGORIES)[number]

export const DECOMPOSITION_LABELS: Record<DecompositionCategory, string> = {
  events: 'Event',
  behaviors: 'Behavior',
  interpretations: 'Interpretation',
  emotions: 'Emotion',
  judgments: 'Judgment',
  assumptions: 'Assumption',
  expectations: 'Expectation',
  identity_attributions: 'Identity attribution',
  context: 'Context',
  unknowns: 'Unknown',
}

// ── Temporal classes (§4.2) ───────────────────────────────────────────────
export const TEMPORAL_CLASSES = [
  'isolated_event',
  'repeated_event',
  'emerging_pattern',
  'historical_pattern',
  'resurfacing_pattern',
  'interrupted_pattern',
  'pattern_transformation',
  'surface_recurrence_structural_difference',
  'structural_recurrence_surface_difference',
] as const
export type TemporalClass = (typeof TEMPORAL_CLASSES)[number]

export const TEMPORAL_LABELS: Record<TemporalClass, string> = {
  isolated_event: 'Isolated event',
  repeated_event: 'Repeated event',
  emerging_pattern: 'Emerging pattern',
  historical_pattern: 'Historical pattern',
  resurfacing_pattern: 'Resurfacing pattern',
  interrupted_pattern: 'Interrupted pattern',
  pattern_transformation: 'Pattern transformation',
  surface_recurrence_structural_difference: 'Surface recurrence / structural difference',
  structural_recurrence_surface_difference: 'Structural recurrence / surface difference',
}

// ── Contradiction classes (§4.3) ──────────────────────────────────────────
export const CONTRADICTION_CLASSES = [
  'direct_contradiction',
  'stated_position_behavior',
  'value_behavior',
  'interpretation_conflict',
  'identity_conflict',
  'temporal_revision',
  'perspective_contradiction',
  'context_dependent_opposition',
  'unresolved_tension',
] as const
export type ContradictionClass = (typeof CONTRADICTION_CLASSES)[number]

export const CONTRADICTION_LABELS: Record<ContradictionClass, string> = {
  direct_contradiction: 'Direct contradiction',
  stated_position_behavior: 'Stated-position / behavior discrepancy',
  value_behavior: 'Value / behavior discrepancy',
  interpretation_conflict: 'Interpretation conflict',
  identity_conflict: 'Identity conflict',
  temporal_revision: 'Temporal revision',
  perspective_contradiction: 'Perspective contradiction',
  context_dependent_opposition: 'Context-dependent opposition',
  unresolved_tension: 'Unresolved tension',
}

/** Dimensions compared before a contradiction may be labelled (§4.3). */
export const CONTRADICTION_DIMENSIONS = ['subject', 'meaning', 'scope', 'time', 'context', 'observer'] as const

// ── Meta-Observational Integrity Audit (§4.8) ─────────────────────────────
export const INTEGRITY_CHECKS = [
  'inference_inflation',
  'interpretation_leakage',
  'lens_contamination',
  'identity_inflation',
  'narrative_coherence_bias',
  'pattern_overfitting',
  'context_collapse',
  'confirmation_loops',
  'counter_hypotheses',
  'disconfirming_evidence',
] as const
export type IntegrityCheck = (typeof INTEGRITY_CHECKS)[number]

export const INTEGRITY_LABELS: Record<IntegrityCheck, string> = {
  inference_inflation: 'Inference inflation',
  interpretation_leakage: 'Interpretation leakage',
  lens_contamination: 'Lens contamination',
  identity_inflation: 'Identity inflation',
  narrative_coherence_bias: 'Narrative coherence bias',
  pattern_overfitting: 'Pattern overfitting',
  context_collapse: 'Context collapse',
  confirmation_loops: 'Confirmation loops',
  counter_hypotheses: 'Counter-hypotheses',
  disconfirming_evidence: 'Disconfirming evidence',
}

// ── Report sections (§4.9) ────────────────────────────────────────────────
export const REPORT_SECTIONS = [
  'Observed Material',
  'Structured Observation Records',
  'Temporal Findings',
  'Contradictions and Tensions',
  'Context Differential',
  'Relational Findings',
  'Pattern Adoption and Maintenance',
  'Observer / Observed Findings',
  'Relational Graph Findings',
  'Lens Comparison',
  'Meta-Observational Integrity Audit',
  'Epistemic Ledger',
  'What Became Visible',
  'Boundary',
] as const

// ── Source types (§4.1) ───────────────────────────────────────────────────
export const SOURCE_TYPES = [
  'event',
  'journal_entry',
  'statement',
  'question',
  'conversation',
  'decision',
  'creative_work',
  'recurring_experience',
  'conflict',
  'symbolic_material',
  'ledger_entry',
  'contrary_session',
  'general_observation',
] as const
export type SourceType = (typeof SOURCE_TYPES)[number]

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  event: 'Event',
  journal_entry: 'Journal entry',
  statement: 'Statement',
  question: 'Question',
  conversation: 'Conversation',
  decision: 'Decision',
  creative_work: 'Creative work',
  recurring_experience: 'Recurring experience',
  conflict: 'Conflict',
  symbolic_material: 'Symbolic material',
  ledger_entry: 'Ledger entry',
  contrary_session: 'On the Contrary session',
  general_observation: 'General observation',
}

// ── On the Contrary (§3.5) ────────────────────────────────────────────────
export const CONTRARY_STEPS = [
  {
    key: 'identified_error',
    name: 'Identified Error',
    prompt: 'What is the apparent error, imbalance, problem, unwanted event, or contradiction, described as it occurred?',
  },
  {
    key: 'implied_expectation',
    name: 'Implied Expectation',
    prompt: 'What expectation is implied by calling this an error? What was supposed to happen instead, and according to whom?',
  },
  {
    key: 'missing_variables',
    name: 'Missing Variables',
    prompt: 'What relevant conditions, facts, perspectives, or timings are absent, inaccessible, or unknown here?',
  },
  {
    key: 'system_relationship',
    name: 'System Relationship',
    prompt: 'Within what wider system does this occur? Which parts, people, conditions, and exchanges relate to it?',
  },
  {
    key: 'contrary_position',
    name: 'Contrary Position',
    prompt: 'From another position inside the same system, how does the same material appear?',
  },
  {
    key: 'balance',
    name: 'Balance',
    prompt: 'Across the whole system, what relationship between the parts becomes visible?',
  },
] as const
export type ContraryStepKey = (typeof CONTRARY_STEPS)[number]['key']

export const BALANCE_NOTE =
  'Balance describes relationship within a system. It does not automatically mean fairness, desirability, approval, justice, health, morality, correctness, comfort, or forced positivity.'

export const HARM_NOTE =
  'Harm named in this material remains harm. Examining system relationship does not erase it, excuse it, or require it to be read positively.'

// ── Pattern Adoption (§3.6) ───────────────────────────────────────────────
export const PATTERN_ADOPTION_STAGES = [
  'Signal',
  'Recurrence',
  'Reinforcement',
  'Defaulting',
  'Integration',
  'Identification',
  'Preservation',
  'Visibility',
  'Revision',
] as const
export type PatternAdoptionStage = (typeof PATTERN_ADOPTION_STAGES)[number]

// ── Relational intelligence (§3.8) ────────────────────────────────────────
export const RELATIONSHIP_TYPES = [
  'RELATED_TO',
  'CONTRADICTS',
  'REPEATS',
  'EXPANDS',
  'PRECEDES',
  'FOLLOWS',
  'SAME_CONTEXT',
  'DIFFERENT_CONTEXT',
  'REFERENCES',
  'SUPPORTED_BY',
  'CHALLENGED_BY',
  'CHANGES_UNDER',
  'ABSENT_UNDER',
] as const
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number]

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  RELATED_TO: 'Related to',
  CONTRADICTS: 'Contradicts',
  REPEATS: 'Repeats',
  EXPANDS: 'Expands',
  PRECEDES: 'Precedes',
  FOLLOWS: 'Follows',
  SAME_CONTEXT: 'Same context',
  DIFFERENT_CONTEXT: 'Different context',
  REFERENCES: 'References',
  SUPPORTED_BY: 'Supported by',
  CHALLENGED_BY: 'Challenged by',
  CHANGES_UNDER: 'Changes under',
  ABSENT_UNDER: 'Absent under',
}

export const EDGE_NOTE = 'A graph edge records a visible relationship; it is not automatically a causal mechanism.'

// ── Multi-lens (§8.4, §18) ────────────────────────────────────────────────
export const LENSES = [
  { key: 'pci_structural', label: 'PCI structural', ceiling: 'DIRECT' },
  { key: 'cognitive', label: 'Cognitive', ceiling: 'INFERRED' },
  { key: 'behavioral', label: 'Behavioral', ceiling: 'DIRECT' },
  { key: 'systems', label: 'Systems', ceiling: 'INFERRED' },
  { key: 'relational', label: 'Relational', ceiling: 'INFERRED' },
  { key: 'identity', label: 'Identity', ceiling: 'INTERPRETIVE' },
  { key: 'creative_process', label: 'Creative process', ceiling: 'INTERPRETIVE' },
  { key: 'jungian', label: 'Jungian / archetypal / shadow', ceiling: 'SYMBOLIC' },
  { key: 'mythological', label: 'Mythological', ceiling: 'SYMBOLIC' },
  { key: 'philosophical', label: 'Philosophical', ceiling: 'PHILOSOPHICAL' },
] as const
export type LensKey = (typeof LENSES)[number]['key']

// ── Entitlement capability flags (§9.3) ───────────────────────────────────
export const ENTITLEMENT_FLAGS = [
  'observe.basic',
  'observe.unlimited',
  'journal.full_history',
  'library.full',
  'audio.full',
  'contrary.full',
  'academy.course.*',
  'community.access',
  'services.booking',
] as const

// ── What PCI is not (§1.2) ────────────────────────────────────────────────
export const PCI_IS_NOT = [
  'A diagnosis engine',
  'A therapy substitute',
  'A motivational application',
  'A personality scoring system',
  'A behavior-correction platform',
  'A moral ranking system',
  'A system that claims access to a permanent or hidden true self',
  'An engine that automatically decides what a user should do next',
] as const

export function activeOperations(): readonly Operation[] {
  return SEVEN_OPERATIONS.filter((op) => op.active)
}
