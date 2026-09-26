// GENERATED from web/lib/pci by scripts/sync-edge-shared.mjs — do not edit here.
// Operation 6: Evidentiary Separation (§4.6).
// What is directly evidenced, what is interpreted or inferred, what remains
// hypothetical, symbolic or philosophical, and what is presently unknown.
import type { DecompositionResult } from './decomposition.ts'
import type {
  CausalHypothesis,
  Contradiction,
  ContextualComparison,
  EpistemicItem,
  EpistemicSeparation,
  ObserverFinding,
  Pattern,
  TemporalFinding,
} from './schema.ts'
import { q } from './text.ts'

export interface SeparationInputs {
  d: DecompositionResult
  patterns: Pattern[]
  comparisons: ContextualComparison[]
  contradictions: Contradiction[]
  temporal: TemporalFinding[]
  observer: ObserverFinding[]
  causal: CausalHypothesis[]
}

export function separate(x: SeparationInputs): EpistemicSeparation {
  const { d } = x
  const sep: EpistemicSeparation = { evidence: [], interpretation: [], inference: [], hypothesis: [], symbolic: [], philosophical: [], unknown: [] }
  let n = 0
  const id = () => `EP-${String(++n).padStart(3, '0')}`
  const add = (bucket: keyof EpistemicSeparation, item: Omit<EpistemicItem, 'id'>) => sep[bucket].push({ id: id(), ...item })

  for (const it of d.decomposition.events) add('evidence', { epistemic_class: 'DIRECT', statement: 'Occurrence described in the material.', anchors: [{ quote: it.quote, record_id: it.record_id }] })
  for (const it of d.decomposition.behaviors) add('evidence', { epistemic_class: 'DIRECT', statement: it.note ?? 'Conduct described.', anchors: [{ quote: it.quote, record_id: it.record_id }] })
  for (const it of d.decomposition.emotions) {
    if (it.epistemic_class === 'SELF_REPORTED') add('evidence', { epistemic_class: 'SELF_REPORTED', statement: 'An emotion is reported. The report is evidence that it was felt, not external verification.', anchors: [{ quote: it.quote, record_id: it.record_id }] })
    else add('interpretation', { epistemic_class: 'INFERRED', statement: it.note ?? 'Emotion attributed to another person.', anchors: [{ quote: it.quote, record_id: it.record_id }] })
  }
  for (const it of d.decomposition.expectations) add('evidence', { epistemic_class: 'SELF_REPORTED', statement: 'The writer reports holding an expectation.', anchors: [{ quote: it.quote, record_id: it.record_id }] })

  for (const it of [...d.decomposition.interpretations, ...d.decomposition.judgments, ...d.decomposition.identity_attributions, ...d.decomposition.assumptions]) {
    add('interpretation', { epistemic_class: 'INTERPRETIVE', statement: it.note ?? 'Interpretation held by the writer.', anchors: [{ quote: it.quote, record_id: it.record_id }] })
  }

  for (const p of x.patterns) add('inference', { epistemic_class: p.epistemic_class === 'SELF_REPORTED' ? 'INFERRED' : p.epistemic_class, statement: p.description, anchors: p.occurrences.slice(0, 3) })
  for (const c of x.comparisons) add('inference', { epistemic_class: 'INFERRED', statement: c.description, anchors: c.anchors })
  for (const c of x.contradictions) add('inference', { epistemic_class: 'INFERRED', statement: c.description, anchors: [c.a, c.b] })
  for (const t of x.temporal) add('inference', { epistemic_class: t.epistemic_class, statement: t.description, anchors: t.anchors.slice(0, 2) })
  for (const o of x.observer) if (o.epistemic_class === 'INFERRED') add('inference', { epistemic_class: 'INFERRED', statement: o.description, anchors: o.anchors })

  for (const h of x.causal) add('hypothesis', { epistemic_class: 'SPECULATIVE', statement: `${h.observed_sequence} ${h.candidate_mechanism}`, anchors: h.supporting_evidence })
  // Counter-readings for intent assigned to others (integrity audit: counter-hypotheses).
  for (const it of d.decomposition.interpretations.filter((i) => i.subject === 'other').slice(0, 3)) {
    add('hypothesis', { epistemic_class: 'SPECULATIVE', statement: `Other readings of the conduct behind ${q(it.quote)} are not excluded by the material.`, anchors: [{ quote: it.quote, record_id: it.record_id }] })
  }

  for (const c of d.clauses.filter((c) => c.symbolic)) {
    add('symbolic', { epistemic_class: 'SYMBOLIC', statement: `Symbolic or dream material (${q(c.symbolic!)}). It is held as symbol, not as fact.`, anchors: [{ quote: c.text, record_id: c.record_id }] })
  }
  for (const c of d.clauses.filter((c) => c.philosophical)) {
    add('philosophical', { epistemic_class: 'PHILOSOPHICAL', statement: `A proposition about meaning or existence (${q(c.philosophical!)}). Coherence here is not empirical proof.`, anchors: [{ quote: c.text, record_id: c.record_id }] })
  }

  for (const u of d.decomposition.unknowns) add('unknown', { epistemic_class: 'UNKNOWN', statement: u.note ?? 'Unknown.', anchors: [] })
  return sep
}
