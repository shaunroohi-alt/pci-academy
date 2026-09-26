// GENERATED from web/lib/pci by scripts/sync-edge-shared.mjs — do not edit here.
// Operation 4: Pattern Detection (§3.6, §4.2).
// Recurrence is reported without converting it into identity, and without
// inferring origin from repetition. Three bases are kept distinct:
//   reported         — the material itself claims recurrence ("always", "again")
//   within_material  — the same structure appears in separate parts of one submission
//   documented       — recurrence visible across separate, dated material
import { DECOMPOSITION_LABELS, type DecompositionCategory } from './canon.ts'
import { calibrate } from './confidence.ts'
import type { SourceMatch } from './comparison.ts'
import type { DecompositionResult } from './decomposition.ts'
import { REVISION_RE, SELF_IDENTITY_RE, SELF_OBSERVATION_RE, CONTEXT_RES } from './lexicon.ts'
import { classifyOccurrences } from './temporal.ts'
import type { Anchor, Pattern, PatternAdoption } from './schema.ts'
import { apos, contentTerms, plural, q, splitSentences, surfaceMap, unique } from './text.ts'

const AUTOMATIC_RE = /\b(?:automatically|without\s+thinking|before\s+i\s+knew\s+it|as\s+usual|like\s+always|of\s+course\s+i|on\s+autopilot|by\s+default|out\s+of\s+habit|habit)\b/i
const PRESERVE_RE = /\b(?:that'?s\s+just\s+how|it'?s\s+fine|i\s+had\s+to|no\s+choice|it\s+works\s+for\s+me|it'?s\s+who\s+i\s+am|i\s+can'?t\s+help\s+it|i'?ve\s+always\s+been\s+like\s+this)\b/i
const EXCEPTION_RE = /\b(?:except|but\s+this\s+time|not\s+this\s+time|this\s+time\s+i\s+didn'?t|for\s+once|unlike\s+(?:usual|before|last\s+time)|for\s+the\s+first\s+time)\b/i

const COMMON_VERBS = new Set(['want', 'need', 'feel', 'think', 'know', 'said', 'tell', 'make', 'take', 'come', 'look', 'seem', 'give', 'work', 'call', 'tri', 'start', 'stop', 'keep', 'mean', 'happen', 'realli', 'actual', 'person', 'peopl', 'thing', 'someth', 'everyth'])

export function reportedPatterns(d: DecompositionResult): Pattern[] {
  const out: Pattern[] = []
  const seen = new Set<string>()
  for (const c of d.clauses) {
    if (!c.recurrence || seen.has(c.record_id)) continue
    seen.add(c.record_id)
    out.push({
      id: `PR-${String(out.length + 1).padStart(3, '0')}`,
      description: `The material reports recurrence (${q(c.recurrence)}). This is a report of repetition; the separate instances are not themselves documented here.`,
      basis: 'reported',
      occurrences: [{ quote: c.text, record_id: c.record_id }],
      conditions: c.context.length ? c.context.map((m) => `Stated with ${q(m.text)}.`) : ['No conditions are stated for the reported recurrence.'],
      epistemic_class: 'SELF_REPORTED',
      confidence: 'Limited Support',
    })
    if (out.length >= 4) break
  }
  return out
}

export function withinMaterialPatterns(d: DecompositionResult): Pattern[] {
  const out: Pattern[] = []
  const surface = surfaceMap(d.material)
  let n = 0
  const id = () => `PW-${String(++n).padStart(3, '0')}`

  // A category that repeats across separate records (e.g. intent assigned to others three times).
  const repeatable: [DecompositionCategory, string][] = [
    ['interpretations', 'Meaning or intent is assigned'],
    ['judgments', 'An evaluation is made'],
    ['identity_attributions', 'Identity language appears'],
    ['expectations', 'An expectation is implied'],
    ['assumptions', 'A premise is used without verification'],
  ]
  for (const [cat, phrase] of repeatable) {
    const hits = d.clauses.filter((c) => c.categories.has(cat))
    const records = unique(hits.map((h) => h.record_id))
    if (records.length >= 2) {
      const bySubject = hits.filter((h) => h.subject === 'other').length
      out.push({
        id: id(),
        description: `${phrase} in ${plural(records.length, 'separate part')} of the material${bySubject >= 2 ? `, ${bySubject} of them directed at another person` : ''}.`,
        basis: 'within_material',
        occurrences: hits.slice(0, 6).map((h) => ({ quote: h.text, record_id: h.record_id })),
        conditions: [`Category: ${DECOMPOSITION_LABELS[cat].toLowerCase()}.`],
        epistemic_class: 'INFERRED',
        confidence: calibrate(records.length >= 3 ? 3 : 1),
      })
    }
  }

  // A content term that recurs across three or more separate records.
  const termRecords = new Map<string, Set<string>>()
  for (const c of d.clauses) for (const t of c.terms) if (t.length > 3 && !COMMON_VERBS.has(t)) termRecords.set(t, (termRecords.get(t) ?? new Set()).add(c.record_id))
  const repeatedTerms = [...termRecords.entries()].filter(([, rs]) => rs.size >= 3).sort((a, b) => b[1].size - a[1].size).slice(0, 2)
  for (const [term, rs] of repeatedTerms) {
    const hits = d.clauses.filter((c) => rs.has(c.record_id) && c.terms.includes(term))
    const cats = unique(hits.flatMap((h) => [...h.categories]).filter((x) => x !== 'unknowns' && x !== 'context'))
    out.push({
      id: id(),
      description: `${q(surface.get(term) ?? term)} recurs in ${rs.size} separate parts of the material, alongside ${cats.map((x) => DECOMPOSITION_LABELS[x].toLowerCase()).join(', ') || 'no other category'}.`,
      basis: 'within_material',
      occurrences: unique(hits.map((h) => h.record_id)).slice(0, 6).map((rid) => ({ quote: d.records.find((r) => r.id === rid)!.evidence_anchors[0], record_id: rid })),
      conditions: unique(hits.flatMap((h) => h.context.map((m) => `Appears with ${q(m.text)}.`))).slice(0, 4),
      epistemic_class: 'INFERRED',
      confidence: calibrate(Math.min(rs.size, 3)),
    })
  }
  return out
}

export interface DocumentedPattern {
  pattern: Pattern
  adoption: PatternAdoption
}

function contextsIn(text: string): string[] {
  const out: string[] = []
  for (const { kind, re } of CONTEXT_RES) {
    const r = new RegExp(re.source, 'gi')
    let m: RegExpExecArray | null
    while ((m = r.exec(apos(text)))) out.push(`${kind}:${m[0].trim().toLowerCase()}`)
  }
  return unique(out)
}

/** Recurrence across dated sources: the current material plus permitted archive matches. */
export function documentedPatterns(d: DecompositionResult, matches: SourceMatch[], createdAt: string): DocumentedPattern[] {
  if (!matches.length) return []
  const byTerm = new Map<string, SourceMatch[]>()
  for (const m of matches) for (const t of m.shared.slice(0, 5)) if (!COMMON_VERBS.has(t)) byTerm.set(t, [...(byTerm.get(t) ?? []), m])
  const ranked = [...byTerm.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 3)
  const out: DocumentedPattern[] = []
  ranked.forEach(([term, ms], i) => {
    const surface = surfaceMap(d.material, ...ms.map((m) => m.source.text))
    const word = surface.get(term) ?? term
    const occurrences: Anchor[] = [
      { quote: sentenceWith(d.material, term) },
      ...ms.map((m) => ({ quote: sentenceWith(m.source.text, term), source_id: m.source.id, source_date: m.source.date })),
    ]
    const dates = [...ms.map((m) => m.source.date), createdAt]
    const originals = [d.material, ...ms.map((m) => m.source.text)]
    const texts = originals.map(apos)
    const disconfirming = texts.filter((t) => EXCEPTION_RE.test(t)).length
    const contextKinds = unique(texts.flatMap(contextsIn))
    const temporal = classifyOccurrences(dates, createdAt, true)
    const conditions = contextKinds.length ? contextKinds.slice(0, 5).map((c) => `Occurs with ${q(c.split(':')[1])}.`) : ['Conditions are not stated in the material.']
    if (disconfirming) conditions.push(`${plural(disconfirming, 'source')} ${disconfirming === 1 ? 'contains' : 'contain'} exception language, which counts against the pattern.`)
    const pid = `PD-${String(i + 1).padStart(3, '0')}`
    const pattern: Pattern = {
      id: pid,
      description: `${q(word)} recurs across ${dates.length} dated pieces of material (${dates.map((x) => x.slice(0, 10)).sort().join(', ')}). Recurrence is reported; it is not an identity and it does not establish an origin.`,
      basis: 'documented',
      occurrences,
      conditions,
      temporal_class: temporal,
      epistemic_class: dates.length >= 3 ? 'PATTERN_SUPPORTED' : 'INFERRED',
      confidence: calibrate(dates.length - 1, disconfirming),
    }
    const stageAnchors = (re: RegExp): Anchor[] =>
      occurrences.flatMap((o, k) => {
        const quote = sentenceMatching(originals[k] ?? '', re)
        return quote ? [{ ...o, quote }] : []
      })
    const earliest = occurrences.reduce((a, b) => ((b.source_date ?? createdAt) < (a.source_date ?? createdAt) ? b : a))
    const sorted = [...dates].sort()
    const gaps = sorted.slice(1).map((x, k) => new Date(x).getTime() - new Date(sorted[k]).getTime())
    const reinforcing = gaps.length >= 2 && gaps[gaps.length - 1] < gaps[0]
    const adoption: PatternAdoption = {
      id: `PA-${String(i + 1).padStart(3, '0')}`,
      pattern_id: pid,
      description: `Adoption stages evidenced for ${q(word)}. Stages without evidence are left unevidenced rather than inferred.`,
      stages: [
        { stage: 'Signal', evidenced: true, note: `Earliest dated occurrence: ${sorted[0].slice(0, 10)}.`, anchors: [earliest] },
        { stage: 'Recurrence', evidenced: dates.length >= 2, note: `${dates.length} dated occurrences.`, anchors: occurrences.slice(0, 3) },
        { stage: 'Reinforcement', evidenced: reinforcing, note: reinforcing ? 'Intervals between occurrences shorten over time.' : 'Shortening intervals are not evidenced.', anchors: [] },
        { stage: 'Defaulting', evidenced: texts.some((t) => AUTOMATIC_RE.test(t)), note: 'Language of automaticity (for example “without thinking”) in the occurrences.', anchors: stageAnchors(AUTOMATIC_RE) },
        { stage: 'Integration', evidenced: unique(contextKinds.map((c) => c.split(':')[1])).length >= 2, note: 'Occurrences span more than one stated context.', anchors: [] },
        { stage: 'Identification', evidenced: texts.some((t) => SELF_IDENTITY_RE.test(t)), note: 'Identity language appears alongside the occurrences.', anchors: stageAnchors(SELF_IDENTITY_RE) },
        { stage: 'Preservation', evidenced: texts.some((t) => PRESERVE_RE.test(t)), note: 'Language that maintains or justifies the pattern appears.', anchors: stageAnchors(PRESERVE_RE) },
        { stage: 'Visibility', evidenced: texts.some((t) => SELF_OBSERVATION_RE.test(t)), note: 'The writer reports noticing the pattern.', anchors: stageAnchors(SELF_OBSERVATION_RE) },
        { stage: 'Revision', evidenced: texts.some((t) => REVISION_RE.test(t) || EXCEPTION_RE.test(t)), note: 'Change or exception language appears.', anchors: [...stageAnchors(REVISION_RE), ...stageAnchors(EXCEPTION_RE)].slice(0, 3) },
      ],
      origin_note: 'Recurrence does not establish origin. No adoption pathway is inferred from repetition alone.',
    }
    out.push({ pattern, adoption })
  })
  return out
}

function sentenceWith(text: string, stemmed: string): string {
  for (const s of splitSentences(text)) if (contentTerms(s.text).includes(stemmed)) return s.text
  return splitSentences(text)[0]?.text ?? text.slice(0, 200)
}

function sentenceMatching(text: string, re: RegExp): string | null {
  for (const s of splitSentences(text)) if (re.test(apos(s.text))) return s.text
  return null
}
