// GENERATED from web/lib/pci by scripts/sync-edge-shared.mjs — do not edit here.
// Context differential within a single submission (§4.4).
// For parts of the material that share content, report constants, changed
// conditions, context-sensitive and context-invariant features, and the
// comparison variables that are missing. Similar is not equivalent.
import { DECOMPOSITION_LABELS, type DecompositionCategory } from './canon.ts'
import { calibrate } from './confidence.ts'
import type { AnalyzedClause, DecompositionResult } from './decomposition.ts'
import type { ContextualComparison } from './schema.ts'
import { q, surfaceMap, unique } from './text.ts'

interface RecordView {
  id: string
  text: string
  terms: Set<string>
  categories: Set<DecompositionCategory>
  context: string[]
  time: string | null
  clauses: AnalyzedClause[]
}

function views(d: DecompositionResult): RecordView[] {
  return d.records.map((r) => {
    const cs = d.clauses.filter((c) => c.record_id === r.id)
    return {
      id: r.id,
      text: r.evidence_anchors[0],
      terms: new Set(cs.flatMap((c) => c.terms)),
      categories: new Set(cs.flatMap((c) => [...c.categories])),
      context: unique(cs.flatMap((c) => c.context.map((m) => m.text.toLowerCase()))),
      time: cs.find((c) => c.time)?.time ?? null,
      clauses: cs,
    }
  })
}

const label = (c: DecompositionCategory) => DECOMPOSITION_LABELS[c].toLowerCase()

export function contextDifferential(d: DecompositionResult, limit = 3): ContextualComparison[] {
  const surface = surfaceMap(d.material)
  const word = (s: string) => q(surface.get(s) ?? s)
  const vs = views(d).filter((v) => v.terms.size >= 2)
  const pairs: { a: RecordView; b: RecordView; shared: string[] }[] = []
  for (let i = 0; i < vs.length; i++) {
    for (let j = i + 1; j < vs.length; j++) {
      const shared = [...vs[i].terms].filter((t) => vs[j].terms.has(t) && t.length > 3)
      if (shared.length >= 1 && (vs[i].context.join() !== vs[j].context.join() || vs[i].categories.size !== vs[j].categories.size)) {
        pairs.push({ a: vs[i], b: vs[j], shared })
      }
    }
  }
  pairs.sort((x, y) => y.shared.length - x.shared.length)

  return pairs.slice(0, limit).map(({ a, b, shared }, i) => {
    const onlyA = [...a.categories].filter((c) => !b.categories.has(c) && c !== 'unknowns')
    const onlyB = [...b.categories].filter((c) => !a.categories.has(c) && c !== 'unknowns')
    const both = [...a.categories].filter((c) => b.categories.has(c) && c !== 'unknowns')
    const changed: string[] = []
    if (a.context.join() !== b.context.join()) {
      changed.push(`${a.id} context: ${a.context.length ? a.context.map(q).join(', ') : 'not stated'}; ${b.id} context: ${b.context.length ? b.context.map(q).join(', ') : 'not stated'}.`)
    }
    if (a.time !== b.time) changed.push(`Time reference differs: ${a.time ? q(a.time) : 'not stated'} / ${b.time ? q(b.time) : 'not stated'}.`)
    const missing: string[] = []
    if (!a.context.length || !b.context.length) missing.push('Context for at least one of the two parts is not stated.')
    if (!a.time || !b.time) missing.push('The time relationship between the two parts is not stated.')
    if (onlyA.includes('emotions') || onlyB.includes('emotions')) missing.push('Emotional state is reported for only one of the two parts.')
    return {
      id: `CD-${String(i + 1).padStart(3, '0')}`,
      scope: 'within_material' as const,
      compared: [a.id, b.id] as [string, string],
      description: `${a.id} and ${b.id} share content (${shared.slice(0, 4).map(word).join(', ')}) under ${changed.length ? 'different' : 'unstated'} conditions. Shared content is not structural equivalence.`,
      constants: shared.slice(0, 6).map((s) => `Term shared by both parts: ${word(s)}.`),
      changed_conditions: changed,
      context_sensitive: [
        ...onlyA.map((c) => `${label(c)} present in ${a.id} only`),
        ...onlyB.map((c) => `${label(c)} present in ${b.id} only`),
      ],
      context_invariant: both.map((c) => `${label(c)} present in both`),
      missing_variables: missing,
      anchors: [
        { quote: a.text, record_id: a.id },
        { quote: b.text, record_id: b.id },
      ],
      epistemic_class: 'INFERRED' as const,
      confidence: calibrate(Math.min(shared.length, 2)),
    }
  })
}
