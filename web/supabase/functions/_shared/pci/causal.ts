// GENERATED from web/lib/pci by scripts/sync-edge-shared.mjs — do not edit here.
// Causal intelligence (§18). Optional. Sequence is not causation: every
// candidate mechanism is SPECULATIVE, carries alternatives, and is tested
// against disconfirming material where permitted archive material exists.
import { calibrate } from './confidence.ts'
import type { DecompositionResult } from './decomposition.ts'
import type { CausalHypothesis } from './schema.ts'
import { apos, contentTerms, q, truncate } from './text.ts'
import type { ArchiveSource } from './types.ts'

const SEQUENCE_LINK = /^(.{8,}?)\s*,?\s+(?:and\s+then|then|so|which\s+made\s+me|that\s+made\s+me|after\s+which|because)\s+(.{6,})$/i
const AFTER_LINK = /^\s*after\s+(.{4,}?),\s*(.{4,})$/i

export function causalHypotheses(d: DecompositionResult, archive: ArchiveSource[] = []): CausalHypothesis[] {
  const out: CausalHypothesis[] = []
  const sentences = d.records.map((r) => ({ id: r.id, text: r.evidence_anchors[0] }))
  for (const s of sentences) {
    let first: string | null = null
    let second: string | null = null
    const text = apos(s.text)
    let m = AFTER_LINK.exec(text)
    if (m) {
      first = m[1]
      second = m[2]
    } else if ((m = SEQUENCE_LINK.exec(text))) {
      const because = /\bbecause\b/i.test(text)
      first = because ? m[2] : m[1]
      second = because ? m[1] : m[2]
    }
    if (!first || !second) continue
    const aTerms = contentTerms(first).filter((t) => t.length > 3)
    const bTerms = contentTerms(second).filter((t) => t.length > 3)
    if (!aTerms.length || !bTerms.length) continue

    let both = 0
    let aOnly = 0
    let bOnly = 0
    for (const src of archive) {
      const terms = new Set(contentTerms(src.text))
      const hasA = aTerms.some((t) => terms.has(t))
      const hasB = bTerms.some((t) => terms.has(t))
      if (hasA && hasB) both++
      else if (hasA) aOnly++
      else if (hasB) bOnly++
    }
    const disconfirming: string[] = []
    if (archive.length) {
      disconfirming.push(`In permitted earlier material: both parts appear together in ${both}, the first without the second in ${aOnly}, the second without the first in ${bOnly}.`)
    } else {
      disconfirming.push('No earlier material was available to test the sequence against; longitudinal comparison is off or empty.')
    }
    out.push({
      id: `CH-${String(out.length + 1).padStart(3, '0')}`,
      observed_sequence: `${q(truncate(first.trim().replace(/[.!?]+$/, ''), 80))} is followed by ${q(truncate(second.trim().replace(/[.!?]+$/, ''), 80))} in the material.`,
      candidate_mechanism: 'A link between the two is suggested by their order. It is a hypothesis, not a demonstrated mechanism.',
      supporting_evidence: [{ quote: s.text, record_id: s.id }],
      alternative_mechanisms: [
        'Both could accompany a third condition that is not recorded.',
        'The order could be coincidental timing without connection.',
        'The link could run through how the first part was interpreted rather than through the occurrence itself.',
      ],
      disconfirming_evidence: disconfirming,
      epistemic_class: 'SPECULATIVE',
      confidence: archive.length ? (calibrate(both + 1, aOnly) === 'High Support' ? 'Moderate Support' : calibrate(both + 1, aOnly)) : 'Insufficient Evidence',
    })
    if (out.length >= 3) break
  }
  return out
}
