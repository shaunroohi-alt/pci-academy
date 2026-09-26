// GENERATED from web/lib/pci by scripts/sync-edge-shared.mjs — do not edit here.
// Operation 5: Contradiction Detection (§4.3).
// Contradiction exposes tension; it does not force one side to be false.
// Before labelling, subject, meaning, scope, time, context and observer
// position are compared, and the label follows from that comparison.
import type { ContradictionClass } from './canon.ts'
import type { AnalyzedClause, DecompositionResult } from './decomposition.ts'
import {
  ELLIPTICAL_OMISSION_RE,
  INDIFFERENCE_RE,
  INTERPRETATION_RE,
  OMISSION_RE,
  POLARITY_PAIRS,
  REVISION_FROM_RE,
  REVISION_TO_RE,
  SELF_IDENTITY_RE,
  STATED_INTENTION_RE,
  TRAIT_CONFLICTS,
  VALUE_RE,
} from './lexicon.ts'
import type { Contradiction } from './schema.ts'
import { apos, contentTerms, q, splitSentences, stem } from './text.ts'
import type { ArchiveSource } from './types.ts'

type Dim = 'same' | 'different' | 'unknown'

function compare(a: AnalyzedClause, b: AnalyzedClause, meaning: Dim) {
  const ctxA = a.context.map((c) => c.text.toLowerCase()).sort().join('|')
  const ctxB = b.context.map((c) => c.text.toLowerCase()).sort().join('|')
  const subject: Dim = a.subject === b.subject && a.subject !== 'unspecified' ? 'same' : a.subject === 'unspecified' || b.subject === 'unspecified' ? 'unknown' : 'different'
  const scope: Dim = !!a.absolutes.length !== !!b.absolutes.length ? 'different' : a.absolutes.length ? 'same' : 'unknown'
  const time: Dim = a.record_id === b.record_id ? 'same' : a.time && b.time ? (a.time.toLowerCase() === b.time.toLowerCase() ? 'same' : 'different') : a.time || b.time ? 'different' : 'unknown'
  const context: Dim = !ctxA && !ctxB ? 'unknown' : ctxA === ctxB ? 'same' : 'different'
  return { subject, meaning, scope, time, context, observer: 'same' as Dim }
}

/** The label follows from the comparison, not from the surface opposition. */
function refine(base: ContradictionClass, dims: ReturnType<typeof compare>, revision: boolean): ContradictionClass {
  if (revision) return 'temporal_revision'
  if (base === 'direct_contradiction') {
    if (dims.context === 'different') return 'context_dependent_opposition'
    if (dims.time === 'different') return 'temporal_revision'
    if (dims.subject !== 'same' || dims.meaning !== 'same') return 'unresolved_tension'
  }
  return base
}

export function detectContradictions(d: DecompositionResult): Contradiction[] {
  const out: Contradiction[] = []
  const cs = d.clauses
  const seen = new Set<string>()
  const push = (base: ContradictionClass, a: AnalyzedClause, b: AnalyzedClause, meaning: Dim, description: string, strength: 1 | 2) => {
    const key = [a.id, b.id].sort().join('|')
    if (a.id === b.id || seen.has(key)) return
    seen.add(key)
    const dims = compare(a, b, meaning)
    // A revision marker reclassifies only a surface opposition, never a named tension.
    const revision = base === 'direct_contradiction' && !!(a.revision || b.revision)
    const cls = refine(base, dims, revision)
    out.push({
      id: `CT-${String(out.length + 1).padStart(3, '0')}`,
      contradiction_class: cls,
      description,
      a: { quote: a.text, record_id: a.record_id },
      b: { quote: b.text, record_id: b.record_id },
      compared_on: dims,
      status: cls === 'temporal_revision' && (revision || base === 'temporal_revision') ? 'revised' : 'unresolved',
      epistemic_class: 'INFERRED',
      confidence: strength === 2 && cls === 'direct_contradiction' ? 'Moderate Support' : 'Limited Support',
    })
  }

  // Polarity: "I want to go" / "I don't want to go".
  for (const [pos, neg, label] of POLARITY_PAIRS) {
    for (const a of cs) {
      const ma = pos.exec(a.norm)
      if (!ma || neg.test(a.norm)) continue
      for (const b of cs) {
        if (b === a) continue
        const mb = neg.exec(b.norm)
        if (!mb) continue
        const objA = ma[1] ? stem(ma[1].toLowerCase()) : ''
        const objB = mb[1] ? stem(mb[1].toLowerCase()) : ''
        const same = !objA || !objB || objA === objB
        if (!same) continue
        push('direct_contradiction', a, b, 'same', `Opposed positions (${label}) on ${objA ? q(ma[1]) : 'the same matter'} appear in the material. Both are kept; neither is treated as false.`, 2)
      }
    }
  }

  // Stated position / behavior: "I said I would call" / "I didn't call".
  for (const a of cs) {
    const m = STATED_INTENTION_RE.exec(a.norm)
    if (!m) continue
    const verb = stem(m[1].toLowerCase())
    const ai = cs.indexOf(a)
    for (const b of cs) {
      if (b === a || b.subject !== 'self') continue
      const om = OMISSION_RE.exec(b.norm)
      const elliptical = ELLIPTICAL_OMISSION_RE.test(b.norm) && Math.abs(cs.indexOf(b) - ai) <= 2
      if ((om && stem(om[1].toLowerCase()) === verb) || elliptical || (/\binstead\b/i.test(b.norm) && b.record_id !== a.record_id)) {
        push('stated_position_behavior', a, b, 'same', `A stated intention (${q(m[0])}) and a described action do not match.`, 2)
      }
    }
  }

  // Value / behavior: "I value honesty" / "I didn't tell her".
  for (const a of cs) {
    const m = VALUE_RE.exec(a.norm)
    if (!m) continue
    const valueTerms = new Set(contentTerms(m[1]))
    for (const b of cs) {
      if (b === a || !b.omission) continue
      if (b.terms.some((t) => valueTerms.has(t))) {
        push('value_behavior', a, b, 'unknown', `A stated value (${q(m[0])}) appears alongside an omission touching the same matter.`, 1)
      }
    }
  }

  // Identity conflict: "I'm not an angry person" / "I shouted".
  for (const a of cs) {
    if (!SELF_IDENTITY_RE.test(a.norm)) continue
    for (const tc of TRAIT_CONFLICTS) {
      if (!tc.trait.test(a.norm)) continue
      for (const b of cs) {
        if (b === a || b.subject !== 'self' || !tc.conduct.test(b.norm)) continue
        push('identity_conflict', a, b, 'unknown', `An identity statement (${q(a.identity?.text ?? a.text)}) sits alongside described conduct that does not match it (${tc.label}).`, 1)
      }
    }
  }

  // Stated indifference alongside reported emotion.
  for (const a of cs) {
    if (!INDIFFERENCE_RE.test(a.norm)) continue
    for (const b of cs) {
      if (b === a || !b.emotions.length || b.subject === 'other') continue
      if (b.emotions.every((e) => e.family === 'calm' || e.family === 'joy')) continue
      push('unresolved_tension', a, b, 'unknown', `A stated position (${q(INDIFFERENCE_RE.exec(a.norm)![0])}) appears alongside reported emotion (${b.emotions.map((e) => q(e.word)).join(', ')}).`, 1)
    }
  }

  // Interpretation conflict: alternative readings of the same conduct.
  const hedged = cs.filter((c) => /\b(?:maybe|perhaps|might\s+have|could\s+have\s+been|or\s+maybe|possibly)\b/i.test(c.norm))
  const asserted = cs.filter((c) => c.subject === 'other' && isAssertedInterpretation(c))
  for (const a of hedged) {
    for (const b of asserted) {
      push('interpretation_conflict', a, b, 'unknown', 'Two readings of the same conduct are present, one held tentatively and one asserted.', 1)
    }
  }

  // Temporal revision within the material: "At first I thought…, but now…".
  // Both sides must be present; a lone "anymore" points at a position the material does not contain.
  for (const a of cs) {
    const from = REVISION_FROM_RE.exec(a.norm)
    if (!from) continue
    const ai = cs.indexOf(a)
    const b = cs.slice(ai + 1, ai + 4).find((x) => REVISION_TO_RE.test(x.norm))
    if (b) push('temporal_revision', a, b, 'same', `A position is revised within the material (${q(from[0])} … ${q(REVISION_TO_RE.exec(b.norm)![0])}). The earlier position remains part of the record.`, 1)
  }

  return out.slice(0, 8)
}

function isAssertedInterpretation(c: AnalyzedClause): boolean {
  return INTERPRETATION_RE.test(c.norm) && !/\b(?:maybe|perhaps|might|possibly)\b/i.test(c.norm)
}

/** Opposed positions between current material and permitted archive sources. */
export function archiveContradictions(d: DecompositionResult, archive: ArchiveSource[], startIndex: number): Contradiction[] {
  const out: Contradiction[] = []
  for (const source of archive) {
    const sentences = splitSentences(source.text)
    for (const [pos, neg, label] of POLARITY_PAIRS) {
      for (const c of d.clauses) {
        for (const s of sentences) {
          for (const [nowRe, thenRe] of [
            [pos, neg],
            [neg, pos],
          ] as const) {
            const mNow = nowRe.exec(c.norm)
            const mThen = thenRe.exec(apos(s.text))
            if (!mNow || !mThen) continue
            if (nowRe === pos && neg.test(c.norm)) continue
            if (thenRe === pos && neg.test(apos(s.text))) continue
            const objNow = mNow[1] ? stem(mNow[1].toLowerCase()) : ''
            const objThen = mThen[1] ? stem(mThen[1].toLowerCase()) : ''
            if (!objNow || objNow !== objThen) continue
            out.push({
              id: `CT-${String(startIndex + out.length + 1).padStart(3, '0')}`,
              contradiction_class: 'temporal_revision',
              description: `A position on ${q(mNow[1])} (${label}) differs from one stated on ${source.date.slice(0, 10)}. The difference in time is kept visible; neither is treated as false.`,
              a: { quote: c.text, record_id: c.record_id },
              b: { quote: s.text, source_id: source.id, source_date: source.date },
              compared_on: { subject: 'same', meaning: 'same', scope: 'unknown', time: 'different', context: 'unknown', observer: 'same' },
              status: 'unresolved',
              epistemic_class: 'INFERRED',
              confidence: 'Limited Support',
            })
            if (out.length >= 4) return out
          }
        }
      }
    }
  }
  return out
}
