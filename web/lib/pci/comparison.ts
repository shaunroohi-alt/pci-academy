// Operation 3: Contextual Comparison against prior material (§3.8, §4.4).
// Runs only on archive sources the user has permitted. Similarity is lexical
// overlap plus a structural signature; neither is causation or sameness.
import { DECOMPOSITION_LABELS, EDGE_NOTE } from './canon.ts'
import { calibrate } from './confidence.ts'
import { signatureOf, type DecompositionResult } from './decomposition.ts'
import { CONTEXT_RES } from './lexicon.ts'
import type { Anchor, ContextualComparison, RelationalFinding } from './schema.ts'
import { apos, contentTerms, jaccard, q, splitSentences, surfaceMap, unique } from './text.ts'
import type { ArchiveSource } from './types.ts'
import { buildCorpus, cosine, sharedTerms, vectorize } from './vector.ts'

export interface SourceMatch {
  source: ArchiveSource
  similarity: number
  structural: number
  shared: string[]
  signature: Set<string>
  currentAnchor: Anchor
  sourceAnchor: Anchor
  contexts: string[]
}

export const RELATED_THRESHOLD = 0.12
export const REPEAT_THRESHOLD = 0.4

function contextsOf(text: string): string[] {
  const out: string[] = []
  for (const { re } of CONTEXT_RES) {
    const r = new RegExp(re.source, 'gi')
    let m: RegExpExecArray | null
    while ((m = r.exec(apos(text)))) out.push(m[0].trim().toLowerCase())
  }
  return unique(out)
}

/** Sentence of `text` sharing the most terms with `terms`. Verbatim. */
export function bestSentence(text: string, terms: string[]): string {
  const want = new Set(terms)
  let best = ''
  let score = -1
  for (const s of splitSentences(text)) {
    const n = contentTerms(s.text).filter((t) => want.has(t)).length
    if (n > score) {
      score = n
      best = s.text
    }
  }
  return best || text.slice(0, 200)
}

export function matchArchive(d: DecompositionResult, archive: ArchiveSource[]): SourceMatch[] {
  if (!archive.length) return []
  const corpus = buildCorpus([d.material, ...archive.map((a) => a.text)])
  const current = vectorize(d.material, corpus)
  const out: SourceMatch[] = []
  for (const source of archive) {
    const v = vectorize(source.text, corpus)
    const similarity = cosine(current, v)
    const signature = signatureOf(source.text)
    const structural = jaccard(d.signature, signature)
    if (similarity < RELATED_THRESHOLD && !(structural >= 0.7 && d.signature.size >= 4)) continue
    const shared = sharedTerms(current, v)
    out.push({
      source,
      similarity,
      structural,
      shared,
      signature,
      currentAnchor: { quote: bestSentence(d.material, shared) },
      sourceAnchor: { quote: bestSentence(source.text, shared), source_id: source.id, source_date: source.date },
      contexts: contextsOf(source.text),
    })
  }
  return out.sort((a, b) => b.similarity + b.structural * 0.3 - (a.similarity + a.structural * 0.3))
}

function daysBetween(a: string, b: string): number {
  return Math.round(Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000)
}

function sigLabel(tag: string): string {
  const [cat, who] = tag.split(':')
  const l = DECOMPOSITION_LABELS[cat as keyof typeof DECOMPOSITION_LABELS]
  if (l) return who && who !== 'unspecified' && who !== 'situation' ? `${l.toLowerCase()} (${who === 'self' ? 'writer' : 'another person'})` : l.toLowerCase()
  if (cat === 'emotion') return `reported ${who}`
  if (cat === 'absolute') return 'absolute frequency terms'
  if (cat === 'interpretive_feeling') return 'interpretation phrased as feeling'
  if (cat === 'identity') return `identity language (${who === 'self' ? 'writer' : 'another person'})`
  return tag
}

export function archiveComparisons(d: DecompositionResult, matches: SourceMatch[], createdAt: string, limit = 3): ContextualComparison[] {
  const currentContexts = contextsOf(d.material)
  return matches.slice(0, limit).map((m, i) => {
    const surface = surfaceMap(d.material, m.source.text)
    const word = (s: string) => q(surface.get(s) ?? s)
    const onlyNow = [...d.signature].filter((t) => !m.signature.has(t) && !t.startsWith('unknowns'))
    const onlyThen = [...m.signature].filter((t) => !d.signature.has(t) && !t.startsWith('unknowns'))
    const both = [...d.signature].filter((t) => m.signature.has(t) && !t.startsWith('unknowns'))
    const changed: string[] = [`${daysBetween(createdAt, m.source.date)} days separate the two.`]
    const ctxNow = currentContexts.filter((c) => !m.contexts.includes(c))
    const ctxThen = m.contexts.filter((c) => !currentContexts.includes(c))
    if (ctxNow.length || ctxThen.length) {
      changed.push(`Context now: ${ctxNow.length ? ctxNow.map(q).join(', ') : 'none additional stated'}; context then: ${ctxThen.length ? ctxThen.map(q).join(', ') : 'none additional stated'}.`)
    }
    const missing = ['Conditions between the two dates are not documented.']
    if (!currentContexts.length || !m.contexts.length) missing.push('Context is not stated for at least one of the two.')
    const lexical = m.similarity >= REPEAT_THRESHOLD ? 'high' : m.similarity >= 0.2 ? 'moderate' : 'low'
    return {
      id: `AC-${String(i + 1).padStart(3, '0')}`,
      scope: 'archive' as const,
      compared: ['current', m.source.id] as [string, string],
      description: `Earlier material (${m.source.title}, ${m.source.date.slice(0, 10)}) shares ${lexical} lexical overlap${m.shared.length ? ` (${m.shared.slice(0, 4).map(word).join(', ')})` : ''} and ${both.length >= 3 ? 'several' : both.length ? 'some' : 'no'} structural features. Similarity is not sameness and is not transmission.`,
      constants: m.shared.slice(0, 5).map((s) => `Term present in both: ${word(s)}.`),
      changed_conditions: changed,
      context_sensitive: [...onlyNow.map((t) => `${sigLabel(t)} present now only`), ...onlyThen.map((t) => `${sigLabel(t)} present then only`)].slice(0, 8),
      context_invariant: both.map((t) => `${sigLabel(t)} present in both`).slice(0, 8),
      missing_variables: missing,
      anchors: [m.currentAnchor, m.sourceAnchor],
      epistemic_class: 'INFERRED' as const,
      confidence: calibrate(m.similarity >= REPEAT_THRESHOLD ? 3 : m.similarity >= 0.2 ? 2 : 1),
    }
  })
}

export function relationalFindings(d: DecompositionResult, matches: SourceMatch[], createdAt: string): RelationalFinding[] {
  const out: RelationalFinding[] = []
  const currentContexts = contextsOf(d.material)
  let n = 0
  const id = () => `RF-${String(++n).padStart(3, '0')}`
  for (const m of matches.slice(0, 6)) {
    const surface = surfaceMap(d.material, m.source.text)
    const terms = m.shared.slice(0, 3).map((s) => q(surface.get(s) ?? s)).join(', ')
    const anchors = [m.currentAnchor, m.sourceAnchor]
    const repeats = m.similarity >= REPEAT_THRESHOLD && m.structural >= 0.5
    out.push({
      id: id(),
      relationship: repeats ? 'REPEATS' : 'RELATED_TO',
      from: 'current',
      to: m.source.id,
      description: repeats
        ? `Content and structure recur from ${m.source.date.slice(0, 10)}${terms ? ` (${terms})` : ''}. ${EDGE_NOTE}`
        : `Related to material from ${m.source.date.slice(0, 10)}${terms ? ` through ${terms}` : ''}. ${EDGE_NOTE}`,
      anchors,
      epistemic_class: 'INFERRED',
      confidence: calibrate(repeats ? 3 : 1),
    })
    if (new Date(m.source.date) < new Date(createdAt) && repeats) {
      out.push({ id: id(), relationship: 'FOLLOWS', from: 'current', to: m.source.id, description: `This material follows the related entry dated ${m.source.date.slice(0, 10)} in time. Order is not mechanism.`, anchors, epistemic_class: 'DIRECT', confidence: 'High Support' })
    }
    const sharedCtx = currentContexts.filter((c) => m.contexts.includes(c))
    if (sharedCtx.length) {
      out.push({ id: id(), relationship: 'SAME_CONTEXT', from: 'current', to: m.source.id, description: `Both name the same context (${sharedCtx.map(q).join(', ')}).`, anchors, epistemic_class: 'DIRECT', confidence: calibrate(sharedCtx.length) })
    } else if (currentContexts.length && m.contexts.length) {
      out.push({ id: id(), relationship: 'DIFFERENT_CONTEXT', from: 'current', to: m.source.id, description: 'Both state a context, and the stated contexts differ.', anchors, epistemic_class: 'DIRECT', confidence: 'Limited Support' })
    }
    const nowTerms = new Set(contentTerms(d.material))
    const thenTerms = contentTerms(m.source.text)
    const covered = thenTerms.filter((t) => nowTerms.has(t)).length / Math.max(1, new Set(thenTerms).size)
    if (covered >= 0.7 && nowTerms.size > new Set(thenTerms).size * 1.5) {
      out.push({ id: id(), relationship: 'EXPANDS', from: 'current', to: m.source.id, description: 'This material contains most of the earlier entry’s content and adds further material.', anchors, epistemic_class: 'INFERRED', confidence: 'Limited Support' })
    }
  }
  return out
}
