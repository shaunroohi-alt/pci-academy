// PCI Framework reference — transcribed from the Consolidated Blueprint &
// Implementation Roadmap, canon 2026.09.25. Wording follows the source; the
// section each article draws on is recorded in `source`. These are canonical
// because the source is the canon document itself.
import type { ContentItem } from '@/lib/content/types'

const CANON = '2026.09.25'
const AT = '2026-09-25T00:00:00.000Z'

type Seed = Omit<ContentItem, 'id' | 'status' | 'canon_status' | 'canon_version' | 'content_version' | 'updated_at' | 'published_at' | 'history' | 'type' | 'collection'> &
  Partial<Pick<ContentItem, 'canon_status'>>

const seed = (s: Seed): ContentItem => ({
  ...s,
  id: `framework:${s.slug}`,
  type: 'framework',
  collection: 'pci-framework',
  status: 'published',
  canon_status: s.canon_status ?? 'canonical',
  canon_version: CANON,
  content_version: 1,
  updated_at: AT,
  published_at: AT,
  history: [],
})

export const FRAMEWORK: ContentItem[] = [
  seed({
    slug: 'what-pci-is',
    order: 1,
    title: 'What PCI Is — and What It Is Not',
    summary: 'PCI may make structure visible. It may not convert visibility into behavioral obligation.',
    source: 'Blueprint §Executive Summary, §1.1–1.3, Final System Definition',
    related: ['seven-operations', 'processing-boundary', 'constitutional-invariants'],
    concepts: ['pci', 'visibility', 'stop-boundary', 'observational-report'],
    body: `The PCI Web App is an observational intelligence environment built around [[Psycho-Creative Intelligence|pci]]. It is not a motivational system, personality test, diagnosis engine, therapy application, or automated advice platform.

Its function is to receive human material, separate the components of that material, compare it across context and time where evidence permits, distinguish evidence from interpretation, surface patterns and contradictions, and produce an [[observational report]].

\`\`\`
Input -> Decomposition -> Contextual Comparison -> Pattern Detection -> Contradiction Detection -> Evidentiary Separation -> Observational Report -> STOP
\`\`\`

## The central contract

The central product contract is simple: PCI may make structure visible. It may not convert visibility into behavioral obligation.

> Visibility is the output. Human choice begins outside the PCI Engine.

## What PCI is not

- A diagnosis engine
- A therapy substitute
- A motivational application
- A personality scoring system
- A behavior-correction platform
- A moral ranking system
- A system that claims access to a permanent or hidden true self
- An engine that automatically decides what a user should do next

## The processing boundary

Any choice, action, strategy, intervention, recommendation, or behavioral direction that follows an observational report belongs outside the PCI Engine and requires a separate non-PCI task or service context.

## The system as a whole

PCI Academy provides the corpus. The user provides material. The PCI Engine exposes structure. The epistemic layer protects the distinction between evidence and interpretation. The documentation layer preserves material over time. The relational layer reveals connections without manufacturing identity claims. The Academy layer provides guided access to the corpus. Infrastructure provides security, persistence, access and scale.

PCI stops. Human choice begins outside the engine.`,
  }),
  seed({
    slug: 'seven-operations',
    order: 2,
    title: 'The Seven Principles / Operations',
    summary: 'Seven user-facing questions form the interaction layer of PCI. They replace the earlier twelve-question architecture.',
    source: 'Blueprint §2',
    related: ['processing-boundary', 'epistemic-classes', 'structured-observation-records'],
    concepts: ['input', 'decomposition', 'contextual-comparison', 'pattern-detection', 'contradiction-detection', 'evidentiary-separation', 'observational-report'],
    body: `The current product replaces the older twelve-question architecture with seven user-facing principles / operations. These seven questions are the interaction layer; they do not limit the internal intelligence available to the mature PCI engine.

## 1 — Input

**What actually occurred, or what material is present, before I explain what it means?**

Preserve the raw material before explanation.

## 2 — Decomposition

**What parts of this are event, behavior, interpretation, emotion, judgment, assumption, context, identity attribution, and unknown?**

Separate categories that are commonly experienced as a single narrative.

## 3 — Contextual Comparison

**Where has something structurally similar appeared before, and what was the same or different about the context?**

Compare without treating similarity as causation or sameness.

## 4 — Pattern Detection

**What appears to repeat across the available material, and under what conditions does that repetition appear?**

Report recurrence without converting it into identity.

## 5 — Contradiction Detection

**What parts of the available material appear inconsistent, incompatible, revised, or unresolved when compared with one another?**

Expose tension without forcing resolution.

## 6 — Evidentiary Separation

**What is directly evidenced here, what is interpreted or inferred, what remains hypothetical or symbolic, and what is presently unknown?**

Protect epistemic classes.

## 7 — Observational Report

**After separating all of this material, what can actually be observed without deciding what I should think, become, choose, or do?**

Return visibility and stop.

## Guided and direct use

In Observe, the seven questions can be answered one at a time (Guided Mode), or a single submission can be processed into the structured PCI report (Direct Analysis Mode). In both, all seven operations are represented in the result.`,
  }),
  seed({
    slug: 'processing-boundary',
    order: 3,
    title: 'The Canonical Processing Boundary',
    summary: 'Behind the seven questions sits the internal PCI v1.1 processing order. It ends at the observational report, and stops.',
    source: 'Blueprint §1.3, §2.1, §4.9',
    related: ['seven-operations', 'integrity-audit-and-report', 'constitutional-invariants'],
    concepts: ['stop-boundary', 'observational-report', 'meta-observational-integrity-audit'],
    body: `\`\`\`
INPUT -> DECOMPOSITION -> CONTEXTUAL COMPARISON -> PATTERN DETECTION -> CONTRADICTION DETECTION -> EVIDENTIARY SEPARATION -> OBSERVATIONAL REPORT -> STOP
\`\`\`

Any choice, action, strategy, intervention, recommendation, or behavioral direction that follows belongs outside the PCI Engine and requires a separate non-PCI task or service context.

## The internal processing order

Behind the seven-question interface, the internal engine may run the mature observational architecture when sufficient material exists:

\`\`\`
INTAKE
-> STRUCTURED OBSERVATION RECORDS
-> DECOMPOSITION
-> TEMPORAL INTELLIGENCE
-> CONTEXT DIFFERENTIAL
-> CONTRADICTION ENGINE
-> PATTERN ADOPTION & MAINTENANCE
-> OBSERVER / OBSERVED INTELLIGENCE
-> RELATIONAL KNOWLEDGE GRAPH
-> MULTI-LENS ANALYSIS WHEN RELEVANT
-> EPISTEMIC CLASSIFICATION
-> CONFIDENCE CALIBRATION
-> META-OBSERVATIONAL INTEGRITY AUDIT
-> OBSERVATIONAL REPORT
-> STOP
\`\`\`

The internal complexity must remain evidence-driven. Advanced layers should be omitted when material is insufficient rather than populated speculatively. Internal rigor must not become interface overload.

## Where every report ends

> PCI boundary reached: the report ends at observation. No prescription is generated.

## The test for every feature

Does this feature make available material more visible, or does it begin deciding what the material requires the person to do? The first remains inside PCI. The second crosses the PCI boundary. That distinction exists not only as philosophy, but in schemas, prompts, validators, interface behavior, tests, release gates, and governance.`,
  }),
  seed({
    slug: 'constitutional-invariants',
    order: 4,
    title: 'Constitutional Invariants',
    summary: 'Fifteen transformations the PCI Engine does not perform unless independently supported by appropriate evidence.',
    source: 'Blueprint §2.2, §8.3',
    related: ['epistemic-classes', 'processing-boundary'],
    concepts: ['constitutional-invariant', 'prescription'],
    body: `The following transformations are prohibited unless independently supported by appropriate evidence. They are enforced in prompt contracts, output schemas, validators, tests, and final report language.

- correlation → causation
- sequence → mechanism
- recurrence → origin
- similarity → transmission
- behavior → permanent identity
- identity language → ontology
- interpretation → direct observation
- symbol → fact
- philosophical coherence → empirical proof
- confidence → certainty
- contradiction → pathology
- emotion → error
- pattern → diagnosis
- visibility → obligation
- observation → prescription

## Output that is rejected or quarantined

Output that crosses the PCI boundary or exceeds available evidence is rejected or quarantined. Examples include:

- You should…
- You need to…
- You must… (except engine rules)
- The right thing is…
- This means you are…
- Your true self is…
- You suffer from…
- The solution is…
- You need to heal / fix / overcome…
- A pattern proves an origin or diagnosis.

## No prescriptive fields

There is deliberately no recommendation, treatment, action plan, best choice, behavioral prescription, personality score, or alignment score field in the PCI observation schema. An output that carries one is invalid by construction.`,
  }),
  seed({
    slug: 'epistemic-classes',
    order: 5,
    title: 'Epistemic Classes and Confidence',
    summary: 'What is evidenced, reported, inferred, interpreted, symbolic, philosophical, speculative or unknown — and how strongly it is supported.',
    source: 'Blueprint §4.6, §4.7',
    related: ['constitutional-invariants', 'structured-observation-records', 'integrity-audit-and-report'],
    concepts: ['epistemic-class', 'evidentiary-separation', 'confidence-calibration'],
    body: `The internal engine retains more precise epistemic classes than the simplified user-facing labels of the Epistemic Ledger (evidence, interpretation, inference, hypothesis, symbolic, philosophical, unknown).

## Internal classes

- **DIRECT** — Explicitly present in supplied material. Maps to evidence.
- **SELF_REPORTED** — Evidence that an internal state, motive, memory, or event was reported; not external verification.
- **INFERRED** — Reasonable interpretation supported but not directly established.
- **PATTERN_SUPPORTED** — Inference supported across multiple materially relevant observations.
- **INTERPRETIVE** — Conceptual frame used to organize material.
- **SYMBOLIC** — Metaphorical, mythological, archetypal, artistic, dream-based, or symbolic reading.
- **PHILOSOPHICAL** — Proposition about meaning, ontology, consciousness, agency, identity, or existence.
- **SPECULATIVE** — Possible explanation with limited support.
- **UNKNOWN** — Cannot presently be established.

## Confidence calibration

Confidence is categorical rather than a fabricated numerical precision. The labels are:

- High Support
- Moderate Support
- Limited Support
- Insufficient Evidence
- Undetermined

A confidence label describes the support available in the material. It is never certainty.`,
  }),
  seed({
    slug: 'structured-observation-records',
    order: 6,
    title: 'Structured Observation Records',
    summary: 'Every meaningful unit of material can become a traceable record: OBS-001, OBS-002, and so on.',
    source: 'Blueprint §4.1, §7.4, §7.5',
    related: ['seven-operations', 'epistemic-classes'],
    concepts: ['structured-observation-record', 'evidence-anchor', 'decomposition'],
    body: `Every meaningful unit of material should be convertible into a traceable observation record. Records use local identifiers such as OBS-001, OBS-002, and so on.

## Fields

- **Source type** — Journal entry, statement, conversation, event, decision, creative work, symbolic material, and so on.
- **Time reference** — Exact date/time, relative time, sequence position, or unknown.
- **Event / direct observation** — What is described or directly present without interpretive expansion.
- **Interpretation** — Meaning assigned to the event.
- **Emotion** — Reported affective experience; inferred only when explicitly marked.
- **Judgment** — Cognitive evaluation, categorization, comparison, conclusion, or valuation.
- **Assumptions** — Premises used without direct verification.
- **Identity attribution** — Claims that convert an event, behavior, role, or feeling into what a person or entity is.
- **Behavior** — Actions, omissions, responses, decisions, and interaction patterns.
- **Context** — Conditions that can materially alter interpretation.
- **Unknown variables** — Relevant absent, inaccessible, contradictory, ambiguous, or unknowable facts.
- **Evidence anchors** — Source statements or passages that support the record.

## Immutable evidence, revisable analysis

\`\`\`
Raw Entry — immutable
Analysis v1 — revisable model
Analysis v2 — revised model
…
Observational Report — current representation of available material
\`\`\`

New information creates a new analysis version. It does not silently rewrite the original input or erase previous interpretations.`,
  }),
  seed({
    slug: 'time-and-context',
    order: 7,
    title: 'Temporal Intelligence and Context Differential',
    summary: 'Recurrence is classified carefully, and similar events are not treated as equivalent until their context is compared.',
    source: 'Blueprint §4.2, §4.4',
    related: ['contradiction-engine', 'pattern-adoption', 'relational-intelligence'],
    concepts: ['temporal-intelligence', 'context-differential', 'contextual-comparison'],
    body: `## Temporal intelligence

When chronology is sufficient, recurrence is classified carefully:

- isolated event
- repeated event
- emerging pattern
- historical pattern
- resurfacing pattern
- interrupted pattern
- pattern transformation
- surface recurrence / structural difference
- structural recurrence / surface difference

Historical material must not be presented as if it necessarily represents the present.

## Context differential

For apparently similar observations, the engine reports:

- constants
- changed conditions
- context-sensitive features
- context-invariant features
- missing comparison variables

Similar events are not structurally equivalent until relevant context is compared.

## Comparison is not causation

Contextual comparison asks where something structurally similar has appeared before, and what was the same or different about the context. It compares without treating similarity as causation or sameness.`,
  }),
  seed({
    slug: 'contradiction-engine',
    order: 8,
    title: 'The Contradiction Engine',
    summary: 'Contradiction exists to expose tension, not to force one side to be false.',
    source: 'Blueprint §4.3',
    related: ['time-and-context', 'on-the-contrary'],
    concepts: ['contradiction', 'contradiction-detection'],
    body: `Contradiction exists to expose tension, not to force one side to be false.

## Supported classes

- direct contradiction
- stated-position / behavior discrepancy
- value / behavior discrepancy
- interpretation conflict
- identity conflict
- temporal revision
- perspective contradiction
- context-dependent opposition
- unresolved tension

## Before labelling a contradiction

Before labelling contradiction, compare:

- subject
- meaning
- scope
- time
- context
- observer position

Two statements that oppose each other on the surface may differ in time (a revision), in context (a context-dependent opposition), or in subject. The label follows from the comparison.

## Contradiction is not pathology

Contradictions remain visible rather than automatically reconciled. A contradiction is material; it is not evidence of a disorder, a flaw, or dishonesty.`,
  }),
  seed({
    slug: 'observer-observed',
    order: 9,
    title: 'Observer / Observed',
    summary: 'PCI may observe how meaning is produced without pathologizing the observer.',
    source: 'Blueprint §4.5',
    related: ['structured-observation-records', 'integrity-audit-and-report'],
    concepts: ['observer-observed'],
    body: `Where relevant, the engine distinguishes:

- observed event
- observer position
- attention selection
- perceptual frame
- interpretive frame
- expectation
- meaning assignment
- observer identity involvement
- state dependency
- self-observation
- any supported observer / observed feedback loop

PCI may observe how meaning is produced without pathologizing the observer.

## Second-order observation

The observer can itself become observable material. When a person reports noticing their own process — "I caught myself", "I noticed I was doing it again" — that self-observation is part of the record, alongside what was observed.`,
  }),
  seed({
    slug: 'integrity-audit-and-report',
    order: 10,
    title: 'The Integrity Audit and the Observational Report',
    summary: 'One controlled self-audit before the report is finalised, and a report that ends at observation.',
    source: 'Blueprint §4.8, §4.9',
    related: ['processing-boundary', 'epistemic-classes'],
    concepts: ['meta-observational-integrity-audit', 'observational-report', 'epistemic-ledger'],
    body: `## Meta-Observational Integrity Audit

Before finalizing the report, the engine performs one controlled self-audit. The audit checks:

- inference inflation
- interpretation leakage
- lens contamination
- identity inflation
- narrative coherence bias
- pattern overfitting
- context collapse
- confirmation loops
- counter-hypotheses
- disconfirming evidence

Material corrections are surfaced only when they materially alter the report.

## The observational report

The mature report may include the following sections when materially populated:

- Observed Material
- Structured Observation Records
- Temporal Findings
- Contradictions and Tensions
- Context Differential
- Relational Findings
- Pattern Adoption and Maintenance
- Observer / Observed Findings
- Relational Graph Findings
- Lens Comparison (when used)
- Meta-Observational Integrity Audit
- Epistemic Ledger
- What Became Visible
- Boundary

> PCI boundary reached: the report ends at observation. No prescription is generated.`,
  }),
  seed({
    slug: 'on-the-contrary',
    order: 11,
    title: 'On the Contrary',
    summary: 'A contained examination of an apparent error, imbalance, problem, unwanted event, or contradiction within a wider relational system.',
    source: 'Blueprint §3.5, §15',
    related: ['contradiction-engine', 'constitutional-invariants'],
    concepts: ['on-the-contrary', 'balance'],
    body: `On the Contrary is a contained mini-application for examining an apparent error, imbalance, problem, unwanted event, or contradiction within a wider relational system.

\`\`\`
IDENTIFIED ERROR -> IMPLIED EXPECTATION -> MISSING VARIABLES -> SYSTEM RELATIONSHIP -> CONTRARY POSITION -> BALANCE
\`\`\`

## Balance

Balance describes relationship within a system. It does not automatically mean fairness, desirability, approval, justice, health, morality, correctness, comfort, or forced positivity.

The engine must not erase harm or coerce negative material into a positive interpretation.

## What On the Contrary is tested against

Sessions are tested against forced positivity, victim-blaming, harm erasure, false equivalence, and prescriptive output. Balance is not presented as moral approval.`,
  }),
  seed({
    slug: 'pattern-adoption',
    order: 12,
    title: 'Pattern Adoption',
    summary: 'An analytical sub-engine, not a personality label. Recurrence alone never establishes origin.',
    source: 'Blueprint §3.6, §16',
    related: ['time-and-context', 'relational-intelligence'],
    concepts: ['pattern-adoption', 'pattern-detection'],
    body: `Pattern Adoption operates as an analytical sub-engine rather than a personality label. The current model:

\`\`\`
Signal -> Recurrence -> Reinforcement -> Defaulting -> Integration -> Identification -> Preservation -> Visibility -> Revision
\`\`\`

The engine may examine candidate adoption pathways, current activation and reinforcement conditions, absence conditions, context dependence, and cross-context recurrence. It must not infer origin from recurrence alone.

## Viewing patterns

A pattern is shown with its recurrence, context, confidence, activation, absence and revision history. Patterns remain revisable and are not identity claims. Stages that the material does not evidence are left unevidenced rather than inferred.`,
  }),
  seed({
    slug: 'relational-intelligence',
    order: 13,
    title: 'Relational Intelligence and the Cognitive Twin',
    summary: 'With explicit permission, current material can be compared with previous material — transparently, traceably, and revisably.',
    source: 'Blueprint §3.8, §3.9, §16, §18',
    related: ['pattern-adoption', 'time-and-context'],
    concepts: ['relational-intelligence', 'graph-edge', 'cognitive-twin', 'causal-hypothesis', 'self-correcting-theory', 'longitudinal-comparison'],
    body: `With explicit user permission, the system can compare current material against previous material. Relationship types include RELATED TO, CONTRADICTS, REPEATS, EXPANDS, PRECEDES, FOLLOWS, SAME CONTEXT, DIFFERENT CONTEXT, REFERENCES, SUPPORTED BY, CHALLENGED BY, CHANGES UNDER, and ABSENT UNDER.

A graph edge records a visible relationship; it is not automatically a causal mechanism.

## Conditions

- Every relationship is traceable to source material.
- Users can disable longitudinal comparison.
- Patterns remain revisable and are not identity claims.
- Contradictions remain visible rather than automatically reconciled.
- Historical material is not presented as current fact.

## Causal intelligence

\`\`\`
Observed Sequence -> Candidate Mechanism -> Supporting Evidence -> Alternative Mechanism -> Disconfirming Evidence -> Confidence
\`\`\`

Sequence is not causation. Causal relationships remain hypotheses unless independently demonstrated.

## The Cognitive Twin

The Cognitive Twin is an advanced, opt-in, revisable structural model generated from available material. It is not a declaration of the user's true self or essence. It is enabled only after enough longitudinal data exists and only by explicit opt-in. Every structural claim stores supporting observations, contradictory observations, epistemic class, confidence, context, first observed, last observed, and revision history.

## Self-correcting theory

\`\`\`
Previous Interpretation -> New Evidence -> Compatibility Test -> Support / Narrow / Contradict / Dissolve -> New Model Version
\`\`\`

Earlier model versions are preserved. The application does not silently rewrite the user's analytical history.`,
  }),
  seed({
    slug: 'multi-lens-analysis',
    order: 14,
    title: 'Multi-Lens Analysis',
    summary: 'Optional lenses produce findings under their own labels before any comparison across lenses.',
    source: 'Blueprint §8.4, §18',
    related: ['epistemic-classes', 'relational-intelligence'],
    concepts: ['multi-lens-analysis', 'lens-isolation'],
    body: `Optional lenses — PCI structural, cognitive, behavioral, systems, relational, identity, creative-process, Jungian / archetypal / shadow, mythological, and philosophical — must produce findings under their own labels before cross-lens comparison.

Findings remain isolated by lens before comparing convergence, divergence, orthogonality and epistemic asymmetry.

## What a lens cannot do

- Symbolic resonance does not become empirical evidence.
- Philosophical coherence does not become scientific proof.
- Behavioral recurrence does not become diagnosis.

A lens organises material from one standpoint. It adds a way of looking, not additional evidence.`,
  }),
  seed({
    slug: 'canon-governance',
    order: 15,
    title: 'Canon Governance',
    summary: 'PCI content and engine behaviour carry explicit canon status so the framework can evolve without silent drift.',
    source: 'Blueprint §1.4, §19.3',
    related: ['what-pci-is'],
    concepts: ['canon-status'],
    body: `PCI content and engine behavior carry explicit canon status so the framework can evolve without silent drift.

## Canon statuses

- **Canonical** — Explicitly established PCI doctrine or terminology.
- **Derived** — Follows from canonical principles but is not independently canonical.
- **Extended** — Deliberately expands an established canonical concept.
- **Provisional** — Proposed but not yet sufficiently integrated or tested.
- **External comparison** — Belongs to another framework and is used comparatively.
- **Contradictory** — Conflicts with current canon as written.
- **Deprecated** — Former PCI framing intentionally superseded by a newer version.

A concept should not be silently promoted from provisional to canonical. Canon change should preserve a traceable revision history, epistemic class, contradiction analysis, and explicit author approval.

## Release gates

- **Canon** — Is the current PCI canon represented correctly, with obsolete architecture inactive?
- **Functional** — Does the feature work across normal and error states?
- **Epistemic** — Are evidence, interpretation, uncertainty, patterns and contradictions represented without overreach?
- **Security** — Is private material isolated, deletable, exportable and protected from client-side secrets and leaks?
- **Operational** — Can the release be monitored, backed up, rolled back and supported in production?`,
  }),
]
