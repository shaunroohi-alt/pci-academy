// Questions on request (handoff 01-SITE-BRIEF, 04-DO-NOT, canon-03-BOUNDARY):
// "Questions appear only after the member explicitly asks for them. They are
// generated from the material just given plus the live corpus. They do not
// assign a direction."
//
// Two sources, one grammar.
//  (a) From the material: the deterministic lexical decomposition separates
//      the material into event / behavior / interpretation / emotion /
//      judgment / assumption / expectation / identity / context, each with the
//      words that produced it. One question per clause, quoting those words
//      verbatim and asking one of the seven operations' questions of them.
//  (b) From the live corpus: a small lexical index over the published texts
//      (title, subtitle, site line, ## headings). Up to two matched texts
//      yield a question that names the text in its own terms.
//
// Every candidate must end in "?", must quote only words that occur in the
// material, and must pass the constitutional validator. Anything that fails
// is dropped silently. Nothing here ends in an assigned action.
import { ARTICLES, CHAPTERS, SUB_CHAPTERS } from '@/content/site'
import { published, SEED_CONTENT } from '@/lib/content/catalog'
import type { ContentItem } from '@/lib/content/types'
import { decompose, type AnalyzedClause, type DecompositionResult } from './decomposition.ts'
import { contentTerms, q, unique } from './text.ts'
import { occursIn, stripVerifiedQuotes, validateText } from './validator.ts'

export interface MaterialQuestion {
  id: string
  text: string
  /** Where the question comes from: the person's own words, or a live Library text. */
  from: { kind: 'material'; quote: string } | { kind: 'text'; slug: string; title: string; collection: string }
}

type Candidate = Omit<MaterialQuestion, 'id'>

/** A material candidate with its selection rank (lower is kept first) and clause position. */
interface RankedCandidate extends Candidate {
  rank: number
  at: number
}

// Requests for a label the lexicon does not yet phrase as such.
const TYPE_REQUEST_RE = /\b(?:what\s+type\s+am\s+i|which\s+type\s+am\s+i|what(?:'s|\s+is)\s+my\s+type|am\s+i\s+an?\s+\w+\s+type)\b/i

function typeRequest(c: AnalyzedClause): string | null {
  const m = TYPE_REQUEST_RE.exec(c.norm)
  return m ? c.text.slice(m.index, m.index + m[0].length) : null
}

// ── Local guard, in addition to the constitutional validator ────────────────
// The validator's rules are about engine speech crossing the boundary. This
// guard is narrower and specific to questions: words that would turn a
// question into a direction even when phrased interrogatively.
const ASSIGNED_DIRECTION_RE =
  /\b(?:should|must|ought|tonight|tomorrow|next\s+steps?|homework|practi[cs]e|exercise|try\s+to|try\s+it|consider|notice|your\s+type|what\s+type|heal(?:ing)?|advice|diagnos\w*)\b/i

function acceptable(text: string, material: string): boolean {
  if (!text.endsWith('?')) return false
  // Quoted user words are evidence; strip them before scanning engine speech.
  const engineSpeech = stripVerifiedQuotes(text, material)
  if (ASSIGNED_DIRECTION_RE.test(engineSpeech)) return false
  return validateText(text, material).ok
}

/** A clause fragment usable as a verbatim quote: present in the material, carrying no quote marks of its own. */
function quotable(fragment: string | null | undefined, material: string): string | null {
  if (!fragment) return null
  const f = fragment.trim().replace(/[.!,;:]+$/, '')
  if (!f || /[“”"]/.test(f)) return null
  if (!material.includes(f)) return null
  return f
}

// ── (a) Questions from the material ────────────────────────────────────────
// One question per clause, chosen by what the decomposition found in it, in
// this order. The grammar is the seven operations: what occurred, which
// parts, where similar, what repeats, what disagrees, evidenced vs inferred,
// what can be seen without deciding.
function clauseQuestion(c: AnalyzedClause, prev: AnalyzedClause | undefined, material: string, at: number): RankedCandidate | null {
  let rank = 0
  const ask = (quote: string, text: string): RankedCandidate => ({ text, from: { kind: 'material', quote }, rank, at })
  let f: string | null

  rank++
  // Operation 7: a request for direction is kept as material; the question looks before the choice.
  if ((f = quotable(c.directionRequest, material))) return ask(f, `${q(f)} asks for a direction. What can be seen before one is chosen?`)

  rank++
  // Operation 6: a request for a label.
  if ((f = quotable(c.classificationRequest ?? typeRequest(c), material))) return ask(f, `${q(f)} asks for a name. What was observed, before a name for it?`)

  rank++
  // Operation 4: identity language — recurrence is not converted into identity.
  if (c.identity && (f = quotable(c.identity.text, material))) {
    return ask(f, `${q(f)} states what someone is. Which conduct in the material carries that word, and how many times?`)
  }

  rank++
  // Operation 2: a feeling that describes another person's conduct.
  if (c.interpretiveFeeling && (f = quotable(c.text, material))) {
    return ask(f, `${q(f)} is phrased as a feeling. Which part of it is the feeling, and which part is a reading of another person?`)
  }

  rank++
  // Operation 5: a stated intention followed by what did not happen.
  if (c.omission && c.connector === 'but' && prev && prev.record_id === c.record_id) {
    const p = quotable(prev.text, material)
    const o = quotable(c.text, material)
    if (p && o) return ask(o, `You wrote ${q(p)} and then ${q(o)}. Where does what was said part from what was done?`)
  }

  rank++
  // Operation 1 / 2: a reason or meaning supplied by the writer.
  if (c.categories.has('interpretations') && (f = quotable(c.text, material))) {
    return ask(f, `You wrote ${q(f)}. What was the event, and what was decided about it?`)
  }

  rank++
  // Operation 4: an absolute covers more instances than are documented.
  if (c.absolutes.length && (f = quotable(c.absolutes.find((a) => /^(?:always|never|every|each|whenever|constantly|all)/i.test(a)) ?? c.absolutes[0], material))) {
    return ask(f, `${q(f)} covers more than one instance. Which instances are in the material?`)
  }

  rank++
  // Operation 6: an evaluation, and the standard it is measured against.
  if (c.judgment && (f = quotable(c.judgment, material))) {
    return ask(f, `${q(f)} is an evaluation. Against which standard, and is that standard in the material?`)
  }

  rank++
  // Operation 6: an expectation names what was supposed to happen.
  if (c.expectation && (f = quotable(c.expectation, material))) {
    return ask(f, `${q(f)} names what was supposed to happen. Where is that stated, and by whom?`)
  }

  rank++
  // Operation 2: an emotion, and what it reported.
  if (c.categories.has('emotions') && c.emotions.length && (f = quotable(c.text, material))) {
    return ask(f, `${q(f)} names an emotion. What preceded it, and what did it report?`)
  }

  rank++
  // Operation 4: recurrence, and the conditions under which it appears.
  if (c.recurrence && (f = quotable(c.recurrence, material))) {
    return ask(f, `${q(f)} reports recurrence. Which instances are documented here, and under what conditions?`)
  }

  rank++
  // Operation 1: what did not happen, and what happened in its place.
  if (c.omission && (f = quotable(c.text, material))) {
    return ask(f, `${q(f)} describes what did not happen. What happened in its place?`)
  }

  rank++
  // Operation 4: an action, and its conditions.
  if (c.behavior && (f = quotable(c.text, material))) {
    return ask(f, `${q(f)} describes an action. Under what conditions did it occur?`)
  }

  rank++
  // Operation 3: context, and where something structurally similar has appeared.
  if (c.context.length && (f = quotable(c.context[0].text, material))) {
    return ask(f, `${q(f)} marks the setting. Where has something structurally similar appeared, and what was different about the setting?`)
  }

  rank++
  // Operation 1: an occurrence, before explanation.
  if (c.categories.has('events') && (f = quotable(c.text, material))) {
    return ask(f, `${q(f)} describes an occurrence. What is present in it before it is explained?`)
  }

  return null
}

function materialQuestions(d: DecompositionResult, material: string): RankedCandidate[] {
  const out: RankedCandidate[] = []
  d.clauses.forEach((c, i) => {
    const cand = clauseQuestion(c, d.clauses[i - 1], material, i)
    if (cand) out.push(cand)
  })
  return out
}

/** Keep the `limit` highest-ranked candidates, then return them in the order the person wrote them. */
function selectByRank(cands: RankedCandidate[], limit: number): RankedCandidate[] {
  return [...cands]
    .sort((a, b) => a.rank - b.rank || a.at - b.at)
    .slice(0, Math.max(0, limit))
    .sort((a, b) => a.at - b.at)
}

// ── (b) Questions from the live corpus ─────────────────────────────────────
// Each published text carries a question written in that text's own terms
// (title, subtitle, or the one-line summary from the site). Texts without
// one get a generic question built from a matched heading. No text's claims
// are paraphrased into advice.
const TEXT_QUESTIONS: Record<string, string> = {
  'chapter-01': 'Chapter 1, Discover Your Hidden Abilities, places recognition before refinement. What in this material is recognised, and what is already being refined?',
  'chapter-02': 'Chapter 2, Practice as a Mythology, reads performance as the default state. Where in this material is practice named, and what is it said to be for?',
  'chapter-03': 'Chapter 3, You Were Finished at Birth, treats eligibility as settled on arrival. What in this material is held to be not yet complete, and by what measure?',
  'chapter-04': 'Chapter 4, Darkness Is an Opportunity to Shine, holds that what is unnamed still runs the day. What in this material is present but not named?',
  'chapter-05': 'Chapter 5, Individualism, separates authorship from isolation. Which parts of this material are authored by the writer, and which are attributed to others?',
  'chapter-06': 'Chapter 6, The Principle of Balance, reads the scale as a report of the weights it carries. Which weights are present here?',
  'chapter-07': 'Chapter 7, Identity — The Field of Possibilities, holds that a name is not the field. Which names are given in this material, and what do they cover?',
  'chapter-08': 'Chapter 8, Growth Is Effortless, reads effort as proof of expenditure, not of growth. Where is effort described here, and what is it taken to show?',
  'chapter-09': 'Chapter 9, You Are Bound to Choose, finds no seat outside one’s own life. Which choices are present in this material, and which are described as no choice at all?',
  'chapter-10': 'Chapter 10, The Observer Gets Observed, puts the watcher in the room. Where in this material does the writer observe, and where is the writer observed?',
  'chapter-11': 'Chapter 11, The Illusion of Challenge, separates a problem from an event and an emotion from an identity. Which here is the event, which the problem, and which the emotion?',
  'chapter-12': 'Chapter 12, Repetition Is Not Repetition, notes that the file can be identical while the listener is not. What repeats here, and what differs between the instances?',
  'the-aaa-method': 'The AAA Method describes adopt, allow, align as a description, not three steps. Which of the three is described in this material, if any?',
  'to-sing-is-to-breathe': 'To Sing Is to Breathe separates technique, which is manufactured, from the person who sings. What in this material is technique, and what is the person?',
  'being-is-becoming': 'Being Is Becoming states that being is manifested and becoming is manufactured. What in this material is described as manufactured, and what as already present?',
  'the-neutral-gateway': 'The Neutral Gateway reads neutral as readable, not acceptable. What in this material is readable without being approved of?',
  'your-business-evolves-around-others': 'Your “Business” Evolves Around Others concerns urgency, coherence, and awareness. Where in this material is urgency present, and whose is it?',
}

// Cue words added to the material's term bag when the decomposition finds a
// category, so a text about emotion can meet material that reports one
// without using the word. Lexical, and declared as such.
const CATEGORY_CUES: [keyof DecompositionResult['decomposition'], string[]][] = [
  ['emotions', ['emotion']],
  ['identity_attributions', ['identity', 'name']],
  ['judgments', ['judgment', 'observer']],
  ['interpretations', ['observer', 'observed']],
  ['expectations', ['problem', 'challenge']],
]

const CORPUS_COLLECTIONS = new Set<string>(['art-of-being', 'companion', 'library'])

interface IndexedText {
  slug: string
  collection: string
  title: string
  order: number
  /** stem → weight (title 3, subtitle / site line 2, heading / own question 1). */
  weights: Map<string, number>
  headings: Map<string, string>
}

function headingsOf(body: string): string[] {
  return unique(
    [...body.matchAll(/^#{2,3}\s+(.+?)\s*$/gm)]
      .map((m) => m[1].trim())
      .filter((h) => h.length > 2 && /[a-z]/i.test(h)),
  )
}

function displayTitle(item: ContentItem): string {
  const ch = CHAPTERS.find((c) => c.slug === item.slug)
  if (ch) return ch.title
  const art = ARTICLES.find((a) => a.slug === item.slug)
  if (art) return art.title
  const sub = SUB_CHAPTERS.find((s) => s.slug === item.slug)
  if (sub) return sub.title
  return item.title
}

let INDEX: IndexedText[] | null = null

function corpusIndex(): IndexedText[] {
  if (INDEX) return INDEX
  const items = published(SEED_CONTENT).filter((i) => CORPUS_COLLECTIONS.has(i.collection) && i.body.trim())
  INDEX = items.map((item, i) => {
    const weights = new Map<string, number>()
    const headings = new Map<string, string>()
    const put = (text: string, w: number, heading?: string) => {
      for (const s of contentTerms(text)) {
        if ((weights.get(s) ?? 0) < w) weights.set(s, w)
        if (heading && !headings.has(s)) headings.set(s, heading)
      }
    }
    put(displayTitle(item), 3)
    put(item.title, 3)
    put(item.summary, 2)
    const line = CHAPTERS.find((c) => c.slug === item.slug)?.line ?? ARTICLES.find((a) => a.slug === item.slug)?.line
    if (line) put(line, 2)
    if (TEXT_QUESTIONS[item.slug]) put(TEXT_QUESTIONS[item.slug], 1)
    for (const h of headingsOf(item.body)) put(h, 1, h)
    return { slug: item.slug, collection: item.collection, title: displayTitle(item), order: item.order ?? 900 + i, weights, headings }
  })
  return INDEX
}

const MATCH_THRESHOLD = 2
/** Category cues together may contribute at most this much, so words the person wrote outrank them. */
const CUE_CAP = 2
const NOISE = new Set(contentTerms('one two three four five six seven eight nine ten first second third hours minutes days weeks months years'))

function corpusQuestions(d: DecompositionResult, material: string, limit: number): Candidate[] {
  const bag = new Set(contentTerms(material).filter((s) => !NOISE.has(s)))
  const cues = new Set<string>()
  for (const [cat, words] of CATEGORY_CUES) {
    if (d.decomposition[cat].length) for (const s of contentTerms(words.join(' '))) if (!bag.has(s)) cues.add(s)
  }
  const scored = corpusIndex()
    .map((t) => {
      let score = 0
      let cueScore = 0
      let best: { stem: string; w: number } | null = null
      for (const s of bag) {
        const w = t.weights.get(s)
        if (!w) continue
        score += w
        if (!best || w > best.w) best = { stem: s, w }
      }
      for (const s of cues) {
        const w = t.weights.get(s)
        if (!w) continue
        cueScore += w
        if (!best) best = { stem: s, w }
      }
      score += Math.min(cueScore, CUE_CAP)
      return { t, score, best }
    })
    // A text without a question of its own needs a title-strength match before its heading is used.
    .filter((x) => x.best && x.score >= (TEXT_QUESTIONS[x.t.slug] ? MATCH_THRESHOLD : MATCH_THRESHOLD + 1))
    .sort((a, b) => b.score - a.score || a.t.order - b.t.order)

  const out: Candidate[] = []
  for (const { t } of scored) {
    if (out.length >= limit) break
    let text = TEXT_QUESTIONS[t.slug]
    if (!text) {
      let heading: string | undefined
      for (const s of bag) if ((heading = t.headings.get(s))) break
      text = heading
        ? `${t.title} has a section headed ${q(heading)}. What in this material is named in those terms, and what only stands near them?`
        : `${t.title} is a text in the Library. What in this material is named in its terms, and what only stands near them?`
    }
    out.push({ text, from: { kind: 'text', slug: t.slug, title: t.title, collection: t.collection } })
  }
  return out
}

// ── Entry point ────────────────────────────────────────────────────────────
export function questionsFromMaterial(material: string, options: { max?: number } = {}): MaterialQuestion[] {
  const max = Math.max(0, Math.floor(options.max ?? 7))
  if (!material || !material.trim() || max === 0) return []

  const d = decompose([{ id: 'input', label: 'Original input', text: material, source_type: 'general_observation' }])

  const seen = new Set<string>()
  const keep = <T extends Candidate>(cands: T[]): T[] =>
    cands.filter((c) => {
      if (seen.has(c.text)) return false
      if (c.from.kind === 'material' && !occursIn(c.from.quote, material)) return false
      if (!acceptable(c.text, material)) return false
      seen.add(c.text)
      return true
    })

  const fromCorpus = keep(corpusQuestions(d, material, 2))
  const fromMaterial = keep(materialQuestions(d, material))

  const chosen: Candidate[] = [...selectByRank(fromMaterial, max - fromCorpus.length), ...fromCorpus].slice(0, max)
  return chosen.map((c, i) => ({ id: `Q-${String(i + 1).padStart(2, '0')}`, text: c.text, from: c.from }))
}
