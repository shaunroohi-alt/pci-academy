// PCI Glossary. Definitions are drawn from the blueprint's own wording.
// 'canonical' where the blueprint states the definition; 'derived' where the
// entry assembles a definition from the blueprint's description of the term.
import type { GlossaryTerm } from '@/lib/content/types'

const g = (slug: string, term: string, definition: string, canon_status: GlossaryTerm['canon_status'], see: string[] = [], source?: string): GlossaryTerm => ({
  slug,
  term,
  definition,
  canon_status,
  see,
  ...(source ? { source } : {}),
})

export const GLOSSARY: GlossaryTerm[] = [
  g('pci', 'Psycho-Creative Intelligence (PCI)', 'The framework behind PCI Academy. As software, an observational intelligence environment: it receives human material, separates its components, compares it across context and time where evidence permits, distinguishes evidence from interpretation, surfaces patterns and contradictions, and produces an observational report — then stops.', 'canonical', ['observational-report', 'stop-boundary'], '§Executive Summary'),
  g('visibility', 'Visibility', 'The output of PCI. PCI may make structure visible; it may not convert visibility into behavioral obligation.', 'canonical', ['prescription', 'stop-boundary'], '§1.1'),
  g('prescription', 'Prescription', 'Any recommendation, treatment, action plan, best choice or behavioral direction. Prescription lies outside the PCI Engine; "observation → prescription" is a prohibited transformation.', 'derived', ['constitutional-invariant', 'visibility'], '§2.2, §7.4'),
  g('stop-boundary', 'STOP boundary', 'The point at which PCI processing ends: after the observational report. Any choice, action, strategy, intervention, recommendation, or behavioral direction that follows belongs outside the PCI Engine.', 'canonical', ['observational-report'], '§1.3'),
  g('input', 'Input', 'The first operation. What actually occurred, or what material is present, before explaining what it means. Principle: preserve the raw material before explanation.', 'canonical', ['decomposition'], '§2'),
  g('decomposition', 'Decomposition', 'The second operation. Separating event, behavior, interpretation, emotion, judgment, assumption, context, identity attribution, and unknown — categories commonly experienced as a single narrative.', 'canonical', ['structured-observation-record'], '§2'),
  g('contextual-comparison', 'Contextual Comparison', 'The third operation. Where something structurally similar has appeared before, and what was the same or different about the context. Compares without treating similarity as causation or sameness.', 'canonical', ['context-differential'], '§2'),
  g('pattern-detection', 'Pattern Detection', 'The fourth operation. What appears to repeat across the available material, and under what conditions. Reports recurrence without converting it into identity.', 'canonical', ['pattern-adoption'], '§2'),
  g('contradiction-detection', 'Contradiction Detection', 'The fifth operation. What parts of the material appear inconsistent, incompatible, revised, or unresolved when compared. Exposes tension without forcing resolution.', 'canonical', ['contradiction'], '§2'),
  g('evidentiary-separation', 'Evidentiary Separation', 'The sixth operation. What is directly evidenced, what is interpreted or inferred, what remains hypothetical or symbolic, and what is presently unknown. Protects epistemic classes.', 'canonical', ['epistemic-class', 'epistemic-ledger'], '§2'),
  g('observational-report', 'Observational Report', 'The seventh operation. What can actually be observed without deciding what the person should think, become, choose, or do. Returns visibility and stops.', 'canonical', ['stop-boundary', 'meta-observational-integrity-audit'], '§2, §4.9'),
  g('structured-observation-record', 'Structured Observation Record', 'A traceable record of one meaningful unit of material (OBS-001, OBS-002…), holding source type, time reference, event, interpretation, emotion, judgment, assumptions, identity attribution, behavior, context, unknown variables and evidence anchors.', 'canonical', ['evidence-anchor'], '§4.1'),
  g('event', 'Event / direct observation', 'What is described or directly present without interpretive expansion.', 'canonical', ['interpretation'], '§4.1'),
  g('interpretation', 'Interpretation', 'Meaning assigned to an event.', 'canonical', ['event', 'judgment'], '§4.1'),
  g('emotion', 'Emotion', 'Reported affective experience; inferred only when explicitly marked. An emotion is material, not an error.', 'canonical', [], '§4.1, §2.2'),
  g('judgment', 'Judgment', 'Cognitive evaluation, categorization, comparison, conclusion, or valuation.', 'canonical', ['interpretation'], '§4.1'),
  g('assumption', 'Assumption', 'A premise used without direct verification.', 'canonical', [], '§4.1'),
  g('identity-attribution', 'Identity attribution', 'A claim that converts an event, behavior, role, or feeling into what a person or entity is.', 'canonical', ['constitutional-invariant'], '§4.1'),
  g('behavior', 'Behavior', 'Actions, omissions, responses, decisions, and interaction patterns.', 'canonical', [], '§4.1'),
  g('context', 'Context', 'Conditions that can materially alter interpretation.', 'canonical', ['context-differential'], '§4.1'),
  g('unknown-variable', 'Unknown variable', 'A relevant absent, inaccessible, contradictory, ambiguous, or unknowable fact.', 'canonical', [], '§4.1'),
  g('evidence-anchor', 'Evidence anchor', 'The source statement or passage that supports a record or finding. In this application, an anchor must quote the material verbatim.', 'derived', ['structured-observation-record'], '§4.1'),
  g('epistemic-class', 'Epistemic class', 'The standing of a statement: DIRECT, SELF_REPORTED, INFERRED, PATTERN_SUPPORTED, INTERPRETIVE, SYMBOLIC, PHILOSOPHICAL, SPECULATIVE or UNKNOWN.', 'canonical', ['evidentiary-separation', 'confidence-calibration'], '§4.6'),
  g('epistemic-ledger', 'Epistemic Ledger', 'The section of an observational report that sorts findings into evidence, interpretation, inference, hypothesis, symbolic, philosophical and unknown.', 'derived', ['epistemic-class'], '§4.9, §7.4'),
  g('confidence-calibration', 'Confidence calibration', 'Categorical confidence in place of fabricated numerical precision: High Support, Moderate Support, Limited Support, Insufficient Evidence, Undetermined.', 'canonical', ['epistemic-class'], '§4.7'),
  g('temporal-intelligence', 'Temporal intelligence', 'Careful classification of recurrence across time — isolated, repeated, emerging, historical, resurfacing, interrupted, transformed, and the surface / structural distinctions. Historical material is not presented as the present.', 'canonical', ['context-differential'], '§4.2'),
  g('context-differential', 'Context differential', 'For apparently similar observations: constants, changed conditions, context-sensitive features, context-invariant features, and missing comparison variables.', 'canonical', ['contextual-comparison'], '§4.4'),
  g('contradiction', 'Contradiction', 'Tension between parts of the material, surfaced to be seen rather than to force one side to be false. Labelled only after comparing subject, meaning, scope, time, context and observer position.', 'canonical', ['contradiction-detection'], '§4.3'),
  g('pattern-adoption', 'Pattern Adoption', 'An analytical sub-engine: Signal → Recurrence → Reinforcement → Defaulting → Integration → Identification → Preservation → Visibility → Revision. Not a personality label; it does not infer origin from recurrence alone.', 'canonical', ['pattern-detection'], '§3.6'),
  g('observer-observed', 'Observer / Observed', 'Distinguishing the observed event from observer position, attention, frames, expectation, meaning assignment, identity involvement, state and self-observation — without pathologizing the observer.', 'canonical', [], '§4.5'),
  g('meta-observational-integrity-audit', 'Meta-Observational Integrity Audit', 'One controlled self-audit before a report is finalised, checking inference inflation, interpretation leakage, lens contamination, identity inflation, narrative coherence bias, pattern overfitting, context collapse, confirmation loops, counter-hypotheses and disconfirming evidence.', 'canonical', ['observational-report'], '§4.8'),
  g('on-the-contrary', 'On the Contrary', 'A contained examination of an apparent error, imbalance, problem, unwanted event or contradiction within a wider relational system: Identified Error → Implied Expectation → Missing Variables → System Relationship → Contrary Position → Balance.', 'canonical', ['balance'], '§3.5'),
  g('balance', 'Balance', 'Relationship within a system. Balance does not automatically mean fairness, desirability, approval, justice, health, morality, correctness, comfort, or forced positivity.', 'canonical', ['on-the-contrary'], '§3.5'),
  g('relational-intelligence', 'Relational intelligence', 'With explicit permission, comparing current material against previous material through traceable relationship types such as RELATED TO, CONTRADICTS, REPEATS and CHANGES UNDER.', 'canonical', ['graph-edge', 'longitudinal-comparison'], '§3.8'),
  g('graph-edge', 'Graph edge', 'A recorded, visible relationship between two pieces of material. It is not automatically a causal mechanism.', 'canonical', ['relational-intelligence'], '§3.8'),
  g('longitudinal-comparison', 'Longitudinal comparison', 'Comparison of current material with the user’s earlier material. Off unless the user explicitly enables it, and can be disabled at any time.', 'derived', ['relational-intelligence'], '§9.1, §16'),
  g('cognitive-twin', 'Cognitive Twin', 'An advanced, opt-in, revisable structural model generated from available material. Not a declaration of the user’s true self or essence; every element links to supporting and contradicting observations.', 'canonical', ['self-correcting-theory'], '§3.9, §18'),
  g('causal-hypothesis', 'Causal hypothesis', 'Observed sequence → candidate mechanism → supporting evidence → alternative mechanism → disconfirming evidence → confidence. Sequence is not causation; causal relationships remain hypotheses unless independently demonstrated.', 'canonical', [], '§18'),
  g('self-correcting-theory', 'Self-correcting theory', 'Previous interpretation → new evidence → compatibility test → support / narrow / contradict / dissolve → new model version. Earlier versions are preserved.', 'canonical', ['cognitive-twin'], '§18'),
  g('constitutional-invariant', 'Constitutional invariant', 'One of fifteen prohibited transformations — such as correlation → causation, behavior → permanent identity, or observation → prescription — enforced in contracts, schemas, validators, tests and report language.', 'canonical', ['prescription'], '§2.2'),
  g('multi-lens-analysis', 'Multi-lens analysis', 'Optional analysis through separate lenses (cognitive, behavioral, systems, relational, identity, creative-process, Jungian, mythological, philosophical), each producing findings under its own label before comparison.', 'canonical', ['lens-isolation'], '§8.4'),
  g('lens-isolation', 'Lens isolation', 'Each lens keeps its findings, and their epistemic class, separate until cross-lens comparison. Symbolic resonance does not become empirical evidence.', 'canonical', ['multi-lens-analysis'], '§8.4'),
  g('canon-status', 'Canon status', 'The standing of PCI content: canonical, derived, extended, provisional, external comparison, contradictory, or deprecated. Nothing is silently promoted from provisional to canonical.', 'canonical', [], '§1.4'),
  g('ledger', 'The Ledger', 'Unrestricted observational storage for observations, ideas, questions, quotes, contradictions, creative fragments, dreams, decisions, conversations, events, hypotheses and symbols.', 'canonical', [], '§3.4'),
]

export function glossarySlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
