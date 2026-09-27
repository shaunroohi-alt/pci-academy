// Observer / Observed intelligence (§4.5). Describes how meaning is produced
// in the material without pathologising the observer. Only populated where
// the material supplies something to observe.
import type { DecompositionResult } from './decomposition.ts'
import { FEEDBACK_LOOP_RE } from './lexicon.ts'
import type { ObserverFinding } from './schema.ts'
import { apos, plural, q } from './text.ts'

export function observerFindings(d: DecompositionResult): ObserverFinding[] {
  const out: ObserverFinding[] = []
  const cs = d.clauses
  const id = () => `OB-${String(out.length + 1).padStart(3, '0')}`

  const selfObs = cs.filter((c) => c.selfObservation)
  if (selfObs.length) {
    out.push({
      id: id(),
      dimension: 'self_observation',
      description: `The writer reports observing their own process (${selfObs.map((c) => q(c.selfObservation!)).join(', ')}). The observer is itself present as material.`,
      anchors: selfObs.slice(0, 3).map((c) => ({ quote: c.text, record_id: c.record_id })),
      epistemic_class: 'SELF_REPORTED',
    })
  }

  const conduct = cs.filter((c) => c.categories.has('behaviors'))
  const otherConduct = conduct.filter((c) => c.subject === 'other').length
  const selfConduct = conduct.filter((c) => c.subject === 'self').length
  if (conduct.length >= 3 && (otherConduct >= selfConduct * 2 || selfConduct >= otherConduct * 2)) {
    const toward = otherConduct > selfConduct ? 'another person’s conduct' : 'the writer’s own conduct'
    out.push({
      id: id(),
      dimension: 'attention_selection',
      description: `Attention in the material rests mainly on ${toward} (${otherConduct} clauses describe others’ conduct, ${selfConduct} the writer’s). What is attended to is itself part of the observation.`,
      anchors: conduct.slice(0, 3).map((c) => ({ quote: c.text, record_id: c.record_id })),
      epistemic_class: 'INFERRED',
    })
  }

  const meaning = cs.filter((c) => c.categories.has('interpretations'))
  const events = cs.filter((c) => c.categories.has('events') || c.categories.has('behaviors'))
  if (meaning.length >= 2) {
    out.push({
      id: id(),
      dimension: 'meaning_assignment',
      description: `Meaning is assigned in ${plural(meaning.length, 'place')}, against ${plural(events.length, 'described occurrence')}. The meaning is produced by the observer; the occurrences are what was observed.`,
      anchors: meaning.slice(0, 3).map((c) => ({ quote: c.text, record_id: c.record_id })),
      epistemic_class: 'INFERRED',
    })
  }

  const expect = cs.filter((c) => c.categories.has('expectations'))
  if (expect.length) {
    out.push({
      id: id(),
      dimension: 'expectation',
      description: `An expectation frames how the occurrence is seen (${expect.map((c) => q(c.expectation!)).slice(0, 3).join(', ')}).`,
      anchors: expect.slice(0, 3).map((c) => ({ quote: c.text, record_id: c.record_id })),
      epistemic_class: 'SELF_REPORTED',
    })
  }

  const identity = cs.filter((c) => c.identity?.about === 'self')
  if (identity.length && events.length) {
    out.push({
      id: id(),
      dimension: 'observer_identity_involvement',
      description: 'The observer’s identity enters the account of the occurrence: a statement about what the writer is appears alongside what happened.',
      anchors: identity.slice(0, 2).map((c) => ({ quote: c.text, record_id: c.record_id })),
      epistemic_class: 'INFERRED',
    })
  }

  const state = cs.filter((c) => c.context.some((m) => m.kind === 'state'))
  if (state.length) {
    out.push({
      id: id(),
      dimension: 'state_dependency',
      description: `The observer’s state at the time is named (${state.flatMap((c) => c.context.filter((m) => m.kind === 'state').map((m) => q(m.text))).slice(0, 3).join(', ')}). What is perceived may vary with state.`,
      anchors: state.slice(0, 2).map((c) => ({ quote: c.text, record_id: c.record_id })),
      epistemic_class: 'INFERRED',
    })
  }

  const loop = d.records.filter((r) => FEEDBACK_LOOP_RE.test(apos(r.evidence_anchors[0])))
  if (loop.length) {
    out.push({
      id: id(),
      dimension: 'feedback_loop',
      description: 'The writer describes a loop between observer and observed. The loop is described by the writer; its mechanism is not established here.',
      anchors: loop.slice(0, 2).map((r) => ({ quote: r.evidence_anchors[0], record_id: r.id })),
      epistemic_class: 'SELF_REPORTED',
    })
  }

  return out
}
