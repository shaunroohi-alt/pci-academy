// Multi-lens analysis (§8.4, §18). Optional. Each lens produces findings
// under its own label, capped at its own epistemic ceiling, before any
// cross-lens comparison. Symbolic resonance does not become evidence.
import { LENSES, type EpistemicClass, type LensKey } from './canon.ts'
import type { AnalyzedClause, DecompositionResult } from './decomposition.ts'
import { FEEDBACK_LOOP_RE } from './lexicon.ts'
import type { LensReport } from './schema.ts'
import { q, unique } from './text.ts'

const CREATIVE_RE = /\b(?:wrote|write|writing|draw|drew|drawing|paint(?:ed|ing)?|song|sing|sang|singing|compos(?:e|ed|ing)|rehears(?:e|al|ed)|perform(?:ed|ing|ance)?|stage|studio|draft|idea|create|created|creative|design(?:ed)?|improvis(?:e|ed)|piece|poem|novel|script|album|practice|practis(?:e|ed))\b/i
const JUNGIAN_RE = /\b(?:shadow|projection|projected|archetyp\w*|persona|anima|animus|the\s+self|dream\w*|nightmare|unconscious|collective|mask|darkness|light)\b/i
const MYTH_RE = /\b(?:myth\w*|hero|heroine|journey|quest|descent|underworld|rebirth|reborn|monster|dragon|trickster|exile|return|threshold|ordeal|sacrifice|fall|phoenix|labyrinth)\b/i
const PHIL_RE = /\b(?:meaning|purpose|existence|exist|being|becoming|consciousness|free\s+will|fate|destiny|reality|truth|identity|soul|self)\b/i

type Finding = LensReport['lenses'][number]['findings'][number]

const anchorOf = (c: AnalyzedClause) => ({ quote: c.text, record_id: c.record_id })

export function lensReport(d: DecompositionResult): LensReport {
  const cs = d.clauses
  const byLens: Record<LensKey, Finding[]> = {
    pci_structural: [],
    cognitive: [],
    behavioral: [],
    systems: [],
    relational: [],
    identity: [],
    creative_process: [],
    jungian: [],
    mythological: [],
    philosophical: [],
  }
  let n = 0
  const f = (lens: LensKey, description: string, clauses: AnalyzedClause[], cls: EpistemicClass) => {
    if (!clauses.length) return
    byLens[lens].push({ id: `LF-${String(++n).padStart(3, '0')}`, description, anchors: clauses.slice(0, 3).map(anchorOf), epistemic_class: cls })
  }

  const cats = unique(cs.flatMap((c) => [...c.categories]))
  f('pci_structural', `The material separates into ${cats.length} decomposition categories.`, cs.slice(0, 1), 'DIRECT')
  f('cognitive', 'Evaluations and premises used to organise the account.', cs.filter((c) => c.judgment || c.assumption), 'INTERPRETIVE')
  f('cognitive', 'Meaning-making: intent, reason or significance supplied by the writer.', cs.filter((c) => c.categories.has('interpretations')), 'INTERPRETIVE')
  f('behavioral', 'Described actions and omissions.', cs.filter((c) => c.categories.has('behaviors')), 'DIRECT')
  f('systems', 'Parts of the account link into a loop or chain of responses.', cs.filter((c) => FEEDBACK_LOOP_RE.test(c.norm) || c.connector === 'so' || c.connector === 'then' || c.connector === 'and then'), 'INFERRED')
  f('relational', 'Other people appear as participants.', cs.filter((c) => c.subject === 'other' || c.context.some((m) => m.kind === 'relation')), 'INFERRED')
  f('identity', 'Statements about what someone is.', cs.filter((c) => c.identity), 'INTERPRETIVE')
  f('creative_process', 'Language of making, rehearsing or performing.', cs.filter((c) => CREATIVE_RE.test(c.norm)), 'INTERPRETIVE')
  f('jungian', 'Imagery a Jungian or archetypal reading would attend to. Symbolic only.', cs.filter((c) => JUNGIAN_RE.test(c.norm) || c.symbolic), 'SYMBOLIC')
  f('mythological', 'Narrative figures with mythological resonance. Symbolic only.', cs.filter((c) => MYTH_RE.test(c.norm)), 'SYMBOLIC')
  f('philosophical', 'Propositions about meaning, being or identity.', cs.filter((c) => c.philosophical || PHIL_RE.test(c.norm)), 'PHILOSOPHICAL')

  const lenses = LENSES.filter((l) => byLens[l.key].length).map((l) => ({ lens: l.key, label: l.label, findings: byLens[l.key] }))

  // Cross-lens comparison only after isolation.
  const cited = new Map<string, { lenses: Set<string>; classes: Set<string> }>()
  for (const l of lenses) {
    for (const fi of l.findings) {
      for (const a of fi.anchors) {
        const e = cited.get(a.quote) ?? { lenses: new Set(), classes: new Set() }
        e.lenses.add(l.label)
        e.classes.add(fi.epistemic_class)
        cited.set(a.quote, e)
      }
    }
  }
  const convergence: string[] = []
  const divergence: string[] = []
  for (const [quote, e] of cited) {
    if (e.lenses.size >= 2 && l0(e.lenses) !== 'PCI structural') convergence.push(`${[...e.lenses].join(', ')} lenses each cite ${q(quote)}.`)
    if (e.classes.size >= 2) divergence.push(`${q(quote)} carries different epistemic classes across lenses (${[...e.classes].join(', ')}).`)
  }
  const orthogonality = lenses
    .filter((l) => l.findings.every((fi) => fi.anchors.every((a) => (cited.get(a.quote)?.lenses.size ?? 0) <= 1)))
    .map((l) => `${l.label} findings share no material with other lenses.`)
  const asym: string[] = []
  const symbolic = lenses.filter((l) => l.findings.some((fi) => fi.epistemic_class === 'SYMBOLIC' || fi.epistemic_class === 'PHILOSOPHICAL'))
  const direct = lenses.filter((l) => l.findings.some((fi) => fi.epistemic_class === 'DIRECT'))
  if (symbolic.length && direct.length) {
    asym.push(`${symbolic.map((l) => l.label).join(', ')} findings remain symbolic or philosophical; they do not become evidence alongside ${direct.map((l) => l.label).join(', ')} findings.`)
  }

  return { lenses, comparison: { convergence: convergence.slice(0, 5), divergence: divergence.slice(0, 5), orthogonality, epistemic_asymmetry: asym } }
}

function l0(s: Set<string>): string {
  return [...s][0]
}
