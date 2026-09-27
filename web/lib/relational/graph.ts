// Relational intelligence across the user's archive (§3.8, §16). Runs only
// with longitudinal permission. Every edge carries the evidence it rests on;
// an edge records a visible relationship, not a causal mechanism.
import { calibrate } from '@/lib/pci/confidence'
import { signatureOf } from '@/lib/pci/decomposition'
import { CONTEXT_RES, EMOTION_RE, emotionFamily, POLARITY_PAIRS, REVISION_RE, SELF_IDENTITY_RE, SELF_OBSERVATION_RE } from '@/lib/pci/lexicon'
import { classifyOccurrences } from '@/lib/pci/temporal'
import { apos, contentTerms, jaccard, splitSentences, stem, surfaceMap, unique } from '@/lib/pci/text'
import type { ArchiveSource } from '@/lib/pci/types'
import { buildCorpus, cosine, sharedTerms, vectorize } from '@/lib/pci/vector'
import type { Confidence, PatternAdoptionStage, RelationshipType, TemporalClass } from '@/lib/pci/canon'

export interface GraphNode extends ArchiveSource {
  contexts: string[]
  emotions: string[]
}

export interface Evidence {
  source_id: string
  date: string
  quote: string
}

export interface GraphEdge {
  id: string
  type: RelationshipType
  from: string
  to: string
  note: string
  evidence: Evidence[]
  confidence: Confidence
}

export interface ArchivePattern {
  key: string
  term: string
  occurrences: Evidence[]
  sources: string[]
  first: string
  last: string
  temporal: TemporalClass
  contexts: string[]
  presentUnder: string[]
  absentUnder: string[]
  emotions: string[]
  exceptions: Evidence[]
  confidence: Confidence
  stages: { stage: PatternAdoptionStage; evidenced: boolean; evidence: Evidence[] }[]
}

export interface ArchiveContradiction {
  id: string
  label: string
  a: Evidence
  b: Evidence
  status: 'unresolved' | 'revised'
}

export interface RelationalModel {
  nodes: GraphNode[]
  edges: GraphEdge[]
  patterns: ArchivePattern[]
  contradictions: ArchiveContradiction[]
}

const STOP_THEMES = new Set(['want', 'need', 'feel', 'think', 'know', 'said', 'tell', 'make', 'take', 'come', 'look', 'seem', 'give', 'work', 'call', 'start', 'stop', 'keep', 'mean', 'happen', 'realli', 'actual', 'person', 'peopl', 'thing', 'someth', 'everyth', 'time', 'week', 'day'])
const EXCEPTION_RE = /\b(?:except|but\s+this\s+time|not\s+this\s+time|this\s+time\s+i\s+didn't|for\s+once|unlike\s+(?:usual|before|last\s+time)|for\s+the\s+first\s+time)\b/i
const AUTOMATIC_RE = /\b(?:automatically|without\s+thinking|before\s+i\s+knew\s+it|as\s+usual|like\s+always|on\s+autopilot|out\s+of\s+habit)\b/i
const PRESERVE_RE = /\b(?:that'?s\s+just\s+how|it'?s\s+fine|i\s+had\s+to|no\s+choice|it'?s\s+who\s+i\s+am|i\s+can'?t\s+help\s+it)\b/i

function contexts(text: string): string[] {
  const out: string[] = []
  const n = apos(text)
  for (const { re } of CONTEXT_RES) {
    const r = new RegExp(re.source, 'gi')
    let m: RegExpExecArray | null
    while ((m = r.exec(n))) out.push(m[0].trim().toLowerCase())
  }
  return unique(out)
}

function emotions(text: string): string[] {
  const out: string[] = []
  const r = new RegExp(EMOTION_RE.source, 'gi')
  let m: RegExpExecArray | null
  while ((m = r.exec(apos(text)))) {
    const f = emotionFamily(m[0].toLowerCase().replace(/\s+/g, ' '))
    if (f) out.push(f)
  }
  return unique(out)
}

function sentenceWith(text: string, test: (s: string) => boolean): string {
  for (const s of splitSentences(text)) if (test(s.text)) return s.text
  return splitSentences(text)[0]?.text ?? text.slice(0, 200)
}

export function buildRelationalModel(sources: ArchiveSource[], links: { from: string; to: string; label: string }[], now: string): RelationalModel {
  const nodes: GraphNode[] = sources.map((s) => ({ ...s, contexts: contexts(s.text), emotions: emotions(s.text) }))
  const edges: GraphEdge[] = []
  let e = 0
  const eid = () => `E-${String(++e).padStart(3, '0')}`

  // Explicit references first: they are recorded by the user, not inferred.
  for (const l of links) {
    const a = nodes.find((n) => n.id === l.from)
    const b = nodes.find((n) => n.id === l.to)
    if (a && b) edges.push({ id: eid(), type: 'REFERENCES', from: a.id, to: b.id, note: `Linked by you: ${l.label}.`, evidence: [], confidence: 'High Support' })
  }

  // Lexical and structural relationships.
  const corpus = buildCorpus(nodes.map((n) => n.text))
  const vecs = nodes.map((n) => vectorize(n.text, corpus))
  const sigs = nodes.map((n) => signatureOf(n.text))
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const sim = cosine(vecs[i], vecs[j])
      if (sim < 0.15) continue
      const [early, late] = nodes[i].date <= nodes[j].date ? [i, j] : [j, i]
      const shared = sharedTerms(vecs[i], vecs[j], 4)
      const surface = surfaceMap(nodes[i].text, nodes[j].text)
      const words = shared.map((s) => `“${surface.get(s) ?? s}”`).join(', ')
      const evidence: Evidence[] = [early, late].map((k) => ({ source_id: nodes[k].id, date: nodes[k].date, quote: sentenceWith(nodes[k].text, (s) => contentTerms(s).some((t) => shared.includes(t))) }))
      const structural = jaccard(sigs[i], sigs[j])
      const repeats = sim >= 0.4 && structural >= 0.5
      edges.push({
        id: eid(),
        type: repeats ? 'REPEATS' : 'RELATED_TO',
        from: nodes[late].id,
        to: nodes[early].id,
        note: `${repeats ? 'Content and structure recur' : 'Shared wording'}${words ? ` (${words})` : ''}.`,
        evidence,
        confidence: calibrate(repeats ? 3 : sim >= 0.3 ? 2 : 1),
      })
      if (repeats) edges.push({ id: eid(), type: 'PRECEDES', from: nodes[early].id, to: nodes[late].id, note: 'Earlier in time. Order is not mechanism.', evidence, confidence: 'High Support' })
      const ci = nodes[i].contexts
      const cj = nodes[j].contexts
      if (ci.length && cj.length) {
        const same = ci.filter((c) => cj.includes(c))
        edges.push(
          same.length
            ? { id: eid(), type: 'SAME_CONTEXT', from: nodes[late].id, to: nodes[early].id, note: `Both name ${same.map((c) => `“${c}”`).join(', ')}.`, evidence, confidence: calibrate(same.length) }
            : { id: eid(), type: 'DIFFERENT_CONTEXT', from: nodes[late].id, to: nodes[early].id, note: 'Related material under different stated contexts.', evidence, confidence: 'Limited Support' },
        )
      }
      const ti = new Set(contentTerms(nodes[early].text))
      const tj = contentTerms(nodes[late].text)
      const covered = [...ti].filter((t) => tj.includes(t)).length / Math.max(1, ti.size)
      if (covered >= 0.7 && tj.length > ti.size * 1.5) edges.push({ id: eid(), type: 'EXPANDS', from: nodes[late].id, to: nodes[early].id, note: 'Contains most of the earlier material and adds to it.', evidence, confidence: 'Limited Support' })
    }
  }

  // Contradictions across sources (polarity on the same object).
  const contradictions: ArchiveContradiction[] = []
  for (let i = 0; i < nodes.length; i++) {
    for (let j = 0; j < nodes.length; j++) {
      if (i === j || nodes[i].date > nodes[j].date) continue
      for (const [pos, neg, label] of POLARITY_PAIRS) {
        for (const si of splitSentences(nodes[i].text)) {
          const a = pos.exec(apos(si.text))
          if (!a || neg.test(apos(si.text))) continue
          for (const sj of splitSentences(nodes[j].text)) {
            const b = neg.exec(apos(sj.text))
            if (!b) continue
            const oa = a[1] ? stem(a[1].toLowerCase()) : ''
            const ob = b[1] ? stem(b[1].toLowerCase()) : ''
            if (!oa || oa !== ob) continue
            const revised = REVISION_RE.test(apos(sj.text))
            const c: ArchiveContradiction = {
              id: `X-${String(contradictions.length + 1).padStart(3, '0')}`,
              label,
              a: { source_id: nodes[i].id, date: nodes[i].date, quote: si.text },
              b: { source_id: nodes[j].id, date: nodes[j].date, quote: sj.text },
              status: revised ? 'revised' : 'unresolved',
            }
            contradictions.push(c)
            edges.push({ id: eid(), type: 'CONTRADICTS', from: nodes[j].id, to: nodes[i].id, note: `Opposed positions (${label}). Both remain visible.`, evidence: [c.a, c.b], confidence: 'Limited Support' })
          }
        }
      }
    }
  }

  // Cross-source patterns (themes appearing in three or more sources).
  const termSources = new Map<string, Set<number>>()
  nodes.forEach((n, k) => {
    for (const t of new Set(contentTerms(n.text))) if (t.length > 3 && !STOP_THEMES.has(t)) termSources.set(t, (termSources.get(t) ?? new Set()).add(k))
  })
  const allContexts = unique(nodes.flatMap((n) => n.contexts))
  const patterns: ArchivePattern[] = [...termSources.entries()]
    .filter(([, ks]) => ks.size >= 3)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 8)
    .map(([term, ks]) => {
      const members = [...ks].map((k) => nodes[k]).sort((a, b) => a.date.localeCompare(b.date))
      const surface = surfaceMap(...members.map((m) => m.text))
      const word = surface.get(term) ?? term
      const occ = (m: GraphNode): Evidence => ({ source_id: m.id, date: m.date, quote: sentenceWith(m.text, (s) => contentTerms(s).includes(term)) })
      const occurrences = members.map(occ)
      const presentUnder = unique(members.flatMap((m) => m.contexts))
      // A context that appears often elsewhere but never with this term.
      const absentUnder = allContexts.filter((c) => !presentUnder.includes(c) && nodes.filter((n) => n.contexts.includes(c)).length >= 2)
      const exceptions = members.filter((m) => EXCEPTION_RE.test(apos(m.text))).map((m) => ({ source_id: m.id, date: m.date, quote: sentenceWith(m.text, (s) => EXCEPTION_RE.test(apos(s))) }))
      const dates = members.map((m) => m.date)
      const gaps = dates.slice(1).map((d, k) => new Date(d).getTime() - new Date(dates[k]).getTime())
      const stageEv = (re: RegExp) => members.filter((m) => re.test(apos(m.text))).map((m) => ({ source_id: m.id, date: m.date, quote: sentenceWith(m.text, (s) => re.test(apos(s))) }))
      return {
        key: term,
        term: word,
        occurrences,
        sources: members.map((m) => m.id),
        first: dates[0],
        last: dates[dates.length - 1],
        temporal: classifyOccurrences(dates, now, false),
        contexts: presentUnder,
        presentUnder,
        absentUnder: absentUnder.slice(0, 4),
        emotions: unique(members.flatMap((m) => m.emotions)),
        exceptions,
        confidence: calibrate(members.length - 1, exceptions.length),
        stages: [
          { stage: 'Signal', evidenced: true, evidence: occurrences.slice(0, 1) },
          { stage: 'Recurrence', evidenced: members.length >= 2, evidence: occurrences.slice(1, 3) },
          { stage: 'Reinforcement', evidenced: gaps.length >= 2 && gaps[gaps.length - 1] < gaps[0], evidence: [] },
          { stage: 'Defaulting', evidenced: stageEv(AUTOMATIC_RE).length > 0, evidence: stageEv(AUTOMATIC_RE) },
          { stage: 'Integration', evidenced: presentUnder.length >= 2, evidence: [] },
          { stage: 'Identification', evidenced: stageEv(SELF_IDENTITY_RE).length > 0, evidence: stageEv(SELF_IDENTITY_RE) },
          { stage: 'Preservation', evidenced: stageEv(PRESERVE_RE).length > 0, evidence: stageEv(PRESERVE_RE) },
          { stage: 'Visibility', evidenced: stageEv(SELF_OBSERVATION_RE).length > 0, evidence: stageEv(SELF_OBSERVATION_RE) },
          { stage: 'Revision', evidenced: exceptions.length > 0 || stageEv(REVISION_RE).length > 0, evidence: [...exceptions, ...stageEv(REVISION_RE)].slice(0, 3) },
        ],
      }
    })

  for (const p of patterns) {
    for (const c of p.absentUnder) {
      const ref = nodes.find((n) => n.contexts.includes(c))
      if (ref) edges.push({ id: eid(), type: 'ABSENT_UNDER', from: p.sources[0], to: ref.id, note: `“${p.term}” does not appear in material stating “${c}”.`, evidence: [], confidence: 'Limited Support' })
    }
    for (const ex of p.exceptions) edges.push({ id: eid(), type: 'CHALLENGED_BY', from: p.sources[0], to: ex.source_id, note: `The pattern around “${p.term}” meets an exception.`, evidence: [ex], confidence: 'Limited Support' })
    if (p.occurrences.length >= 3) edges.push({ id: eid(), type: 'SUPPORTED_BY', from: p.sources[0], to: p.sources[p.sources.length - 1], note: `“${p.term}” recurs across ${p.occurrences.length} sources.`, evidence: p.occurrences.slice(0, 3), confidence: p.confidence })
    const emoBy = new Map<string, Set<string>>()
    for (const id of p.sources) {
      const n = nodes.find((x) => x.id === id)!
      for (const c of n.contexts) for (const em of n.emotions) emoBy.set(c, (emoBy.get(c) ?? new Set()).add(em))
    }
    const ctxs = [...emoBy.keys()]
    if (ctxs.length >= 2) {
      const [c1, c2] = ctxs
      const e1 = [...emoBy.get(c1)!].sort().join(',')
      const e2 = [...emoBy.get(c2)!].sort().join(',')
      if (e1 !== e2) {
        const n1 = nodes.find((n) => p.sources.includes(n.id) && n.contexts.includes(c1))!
        const n2 = nodes.find((n) => p.sources.includes(n.id) && n.contexts.includes(c2))!
        edges.push({ id: eid(), type: 'CHANGES_UNDER', from: n1.id, to: n2.id, note: `Reported emotion alongside “${p.term}” differs between “${c1}” (${e1}) and “${c2}” (${e2}).`, evidence: [], confidence: 'Limited Support' })
      }
    }
  }

  return { nodes, edges, patterns, contradictions }
}
