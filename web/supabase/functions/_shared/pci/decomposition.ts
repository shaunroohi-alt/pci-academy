// GENERATED from web/lib/pci by scripts/sync-edge-shared.mjs — do not edit here.
// Operations 1–2: Input and Decomposition.
// Splits material into Structured Observation Records (OBS-001…) and
// separates each clause into event, behavior, interpretation, emotion,
// judgment, assumption, expectation, identity attribution, context and
// unknown. Every quote is a verbatim substring of the material.
import type { DecompositionCategory, SourceType } from './canon.ts'
import {
  ABSOLUTE_RE,
  ASSUMPTION_RE,
  BEHAVIOR_RE,
  CLASSIFICATION_REQUEST_RE,
  CONTEXT_RES,
  DIRECTION_REQUEST_RE,
  DREAM_RE,
  ELLIPTICAL_OMISSION_RE,
  EMOTION_RE,
  EVENT_RE,
  EXPECTATION_RE,
  FEEL_LIKE_RE,
  HABITUAL_BEHAVIOR_RE,
  HARM_RE,
  INDIFFERENCE_RE,
  STANCE_RE,
  INTERPRETATION_RE,
  INTERPRETIVE_FEELING_RE,
  JUDGMENT_RE,
  METAPHOR_RE,
  OMISSION_RE,
  OTHER_IDENTITY_RE,
  PHILOSOPHICAL_RE,
  RECURRENCE_RE,
  REVISION_RE,
  SELF_EMOTION_RE,
  SELF_IDENTITY_RE,
  SELF_OBSERVATION_RE,
  TIME_REFERENCE_RE,
  emotionFamily,
} from './lexicon.ts'
import type { Decomposition, DecompositionItem, StructuredRecord } from './schema.ts'
import { apos, contentTerms, pad3, q, splitClauses, splitSentences, unique, type Clause } from './text.ts'

export interface MaterialPart {
  id: string
  label: string
  text: string
  source_type: SourceType
}

export type Subject = 'self' | 'other' | 'situation' | 'unspecified'

export interface ContextMarker {
  kind: 'place' | 'relation' | 'time' | 'state'
  text: string
}

export interface AnalyzedClause {
  id: string
  record_id: string
  part_id: string
  text: string
  /** `text` with apostrophes normalised; use for pattern tests, never for quotes. */
  norm: string
  connector: string | null
  subject: Subject
  categories: Set<DecompositionCategory>
  emotions: { word: string; family: string }[]
  interpretiveFeeling: string | null
  feelLike: boolean
  interpretation: string | null
  judgment: string | null
  assumption: string | null
  expectation: string | null
  identity: { text: string; about: 'self' | 'other' } | null
  behavior: string | null
  omission: string | null
  event: string | null
  absolutes: string[]
  recurrence: string | null
  context: ContextMarker[]
  time: string | null
  symbolic: string | null
  philosophical: string | null
  directionRequest: string | null
  classificationRequest: string | null
  harm: string | null
  selfObservation: string | null
  revision: string | null
  question: boolean
  negated: boolean
  terms: string[]
}

export interface DecompositionResult {
  parts: MaterialPart[]
  clauses: AnalyzedClause[]
  records: StructuredRecord[]
  decomposition: Decomposition
  signature: Set<string>
  material: string
}

const RELATION_NOUN =
  /^(?:mother|mom|mum|father|dad|parents?|partner|wife|husband|boyfriend|girlfriend|boss|manager|colleagues?|coworkers?|co-workers?|friends?|sister|brother|son|daughter|team|family|kids|children|teacher|clients?|landlord|neighbou?r|therapist|coach|ex|roommate|flatmate|grandmother|grandfather|aunt|uncle|cousin|students|audience|band|doctor|director|editor)$/i
const PERSON_NOUN = /^(?:manager|boss|team|client|teacher|doctor|driver|kids|children|nurse|landlord|neighbou?r|coach|director|audience|waiter|officer|interviewer|customer|colleague|group|man|woman|guy|girl|boy|person|people|everyone|everybody|nobody|someone|somebody)$/i
const LEAD_FILLER = /^(?:but|and|so|then|because|when|while|although|though|honestly|basically|actually|anyway|well|today|yesterday|tonight|finally|eventually|suddenly|again|also|still|just|even|now|later|earlier|afterwards|obviously|clearly|apparently|maybe|perhaps|probably|sometimes|often|usually|always|never|this|last|morning|evening|night|week|at|in|on|after|before|during)$/i

/** Subject of a clause: the first grammatical subject within its opening words. */
function detectSubject(text: string): Subject {
  const words = text.replace(/[“”"‘’]/g, "'").split(/[\s,;:]+/).filter(Boolean).slice(0, 8)
  for (let i = 0; i < words.length; i++) {
    const raw = words[i]
    const w = raw.toLowerCase().replace(/[^a-z']/g, '')
    if (!w) continue
    if (/^(?:i|i'm|im|i've|i'd|i'll|me|myself)$/.test(w)) return 'self'
    if (/^(?:my|our)$/.test(w)) {
      const next = (words[i + 1] ?? '').toLowerCase().replace(/[^a-z-]/g, '')
      return RELATION_NOUN.test(next) ? 'other' : 'self'
    }
    if (/^(?:he|she|they|him|her|them|his|their|he's|she's|they're|you|you're|we)$/.test(w)) return w === 'we' ? 'self' : 'other'
    if (/^(?:the|a|an)$/.test(w)) {
      const next = (words[i + 1] ?? '').toLowerCase().replace(/[^a-z-]/g, '')
      return PERSON_NOUN.test(next) || RELATION_NOUN.test(next) ? 'other' : 'situation'
    }
    if (/^(?:it|there|it's|there's|that|everything|nothing|traffic|work|life)$/.test(w)) return 'situation'
    if (PERSON_NOUN.test(w)) return 'other'
    // A capitalised word that is not sentence-initial filler reads as a name.
    if (/^[A-Z][a-z]+$/.test(raw) && !LEAD_FILLER.test(w) && !/^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)$/i.test(w)) return 'other'
    if (LEAD_FILLER.test(w)) continue
    return 'unspecified'
  }
  return 'unspecified'
}

/** First match of `re`, run on apostrophe-normalised text, returned verbatim from the original. */
function firstMatch(text: string, re: RegExp): string | null {
  const m = new RegExp(re.source, re.flags.replace('g', '')).exec(apos(text))
  return m ? text.slice(m.index, m.index + m[0].length).trim() : null
}

function contextMarkers(text: string): ContextMarker[] {
  const out: ContextMarker[] = []
  const n = apos(text)
  for (const { kind, re } of CONTEXT_RES) {
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
    let m: RegExpExecArray | null
    while ((m = r.exec(n))) out.push({ kind, text: text.slice(m.index, m.index + m[0].length).trim() })
  }
  const seen = new Set<string>()
  return out.filter((c) => {
    const k = c.text.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function analyzeClause(clause: Clause, id: string, recordId: string, partId: string): AnalyzedClause {
  const text = clause.text
  const norm = apos(text)
  const subject = detectSubject(text)
  const categories = new Set<DecompositionCategory>()

  const interpretiveFeeling = firstMatch(text, INTERPRETIVE_FEELING_RE)
  const feelLike = FEEL_LIKE_RE.test(norm)

  const emotions: { word: string; family: string }[] = []
  const emoRe = new RegExp(EMOTION_RE.source, 'gi')
  let em: RegExpExecArray | null
  while ((em = emoRe.exec(norm))) {
    const word = em[0].toLowerCase().replace(/\s+/g, ' ')
    const family = emotionFamily(word)
    if (family && !emotions.some((e) => e.word === word)) emotions.push({ word, family })
  }
  // "I hope", "I love X" read as stance rather than reported emotion unless framed as feeling.
  const emotionIsReported = emotions.length > 0 && (SELF_EMOTION_RE.test(norm) || subject !== 'self' || /\b(?:felt|feel|feeling)\b/i.test(norm))
  if (emotions.length && emotionIsReported) categories.add('emotions')

  const interpretation = interpretiveFeeling ?? (feelLike ? firstMatch(text, FEEL_LIKE_RE) : null) ?? firstMatch(text, INTERPRETATION_RE)
  if (interpretation) categories.add('interpretations')
  const causalClaim = clause.connector === 'because' || clause.connector === 'since'
  if (causalClaim) categories.add('interpretations')

  // Judgment includes valuation: a stated stance ("I don't care") evaluates.
  const judgment = firstMatch(text, JUDGMENT_RE) ?? firstMatch(text, INDIFFERENCE_RE) ?? firstMatch(text, STANCE_RE)
  if (judgment) categories.add('judgments')

  const assumption = firstMatch(text, ASSUMPTION_RE)
  if (assumption) categories.add('assumptions')

  // "Should I…?" asks for direction; it does not state an expectation.
  const expectation = DIRECTION_REQUEST_RE.test(norm) ? null : firstMatch(text, EXPECTATION_RE)
  if (expectation) categories.add('expectations')

  let identity: AnalyzedClause['identity'] = null
  const selfId = firstMatch(text, SELF_IDENTITY_RE)
  const otherId = selfId ? null : firstMatch(text, OTHER_IDENTITY_RE)
  if (selfId) identity = { text: selfId, about: 'self' }
  else if (otherId) identity = { text: otherId, about: 'other' }
  if (identity) categories.add('identity_attributions')

  const omission = firstMatch(text, OMISSION_RE) ?? firstMatch(text, ELLIPTICAL_OMISSION_RE)
  const behavior = firstMatch(text, BEHAVIOR_RE) ?? firstMatch(text, HABITUAL_BEHAVIOR_RE)
  if (behavior || omission) categories.add('behaviors')

  const event = firstMatch(text, EVENT_RE)
  if (event) categories.add('events')

  const context = contextMarkers(text)
  if (context.length) categories.add('context')

  const question = clause.question

  // Plain description with nothing interpretive attached reads as an event.
  if (!question && categories.size === 0 && text.split(/\s+/).length >= 3) categories.add('events')
  if (!question && categories.size === 1 && categories.has('context') && !interpretation) categories.add('events')

  const absolutes: string[] = []
  const absRe = new RegExp(ABSOLUTE_RE.source, 'gi')
  let ab: RegExpExecArray | null
  while ((ab = absRe.exec(norm))) absolutes.push(text.slice(ab.index, ab.index + ab[0].length))

  return {
    id,
    record_id: recordId,
    part_id: partId,
    text,
    norm,
    connector: clause.connector,
    subject,
    categories,
    emotions: emotionIsReported ? emotions : [],
    interpretiveFeeling,
    feelLike,
    interpretation: interpretation ?? (causalClaim ? text : null),
    judgment,
    assumption,
    expectation,
    identity,
    behavior: behavior ?? omission,
    omission,
    event,
    absolutes,
    recurrence: firstMatch(text, RECURRENCE_RE),
    context,
    time: firstMatch(text, TIME_REFERENCE_RE),
    symbolic: firstMatch(text, DREAM_RE) ?? firstMatch(text, METAPHOR_RE),
    philosophical: firstMatch(text, PHILOSOPHICAL_RE),
    directionRequest: firstMatch(text, DIRECTION_REQUEST_RE),
    classificationRequest: firstMatch(text, CLASSIFICATION_REQUEST_RE),
    harm: firstMatch(text, HARM_RE),
    selfObservation: firstMatch(text, SELF_OBSERVATION_RE),
    revision: firstMatch(text, REVISION_RE),
    question,
    negated: /\b(?:not|never|no|didn't|don't|doesn't|won't|can't|couldn't|wouldn't|isn't|wasn't|aren't|weren't)\b/i.test(norm),
    terms: contentTerms(text),
  }
}

const SUBJECT_LABEL: Record<Subject, string> = {
  self: 'the writer',
  other: 'another person',
  situation: 'the situation',
  unspecified: 'an unspecified subject',
}

function recordUnknowns(clauses: AnalyzedClause[], materialHasTime: boolean): string[] {
  const out: string[] = []
  const add = (s: string) => {
    if (!out.includes(s)) out.push(s)
  }
  for (const c of clauses) {
    if (c.interpretation && c.subject === 'other') add('The other person’s own account of their intent or state is not present in the material.')
    if (c.interpretiveFeeling) add('Whether the other person’s conduct carried the meaning assigned to it is not established by the material.')
    if (c.emotions.length && c.subject === 'other') add('Another person’s internal state is described by the writer; only their observable conduct could be present here.')
    if (c.absolutes.length) add(`Frequency is asserted (${q(c.absolutes[0])}); the individual instances are not documented here.`)
    if (c.connector === 'because' || c.connector === 'since') add('The link between these parts is asserted by the writer; it is not otherwise evidenced.')
    if (/\b(?:going\s+to|will\s+never|won't\s+ever|will\s+always|never\s+going)\b/i.test(c.norm)) add('The future outcome described is not observable at the time of writing.')
    if (c.judgment && !c.expectation) add('The standard against which this is evaluated is not stated.')
    if (c.expectation) add('Whether this expectation was shared or communicated is not stated.')
    if (c.identity) add('The material contains conduct and feeling; what someone permanently is cannot be established from it.')
    if (c.question) add(`An open question is present (${q(c.text)}); it remains open.`)
  }
  const describesOccurrence = clauses.some((c) => c.categories.has('events') || c.categories.has('behaviors'))
  if (describesOccurrence && !materialHasTime && !clauses.some((c) => c.time)) add('When this occurred is not stated.')
  return out
}

function item(
  id: string,
  quote: string,
  epistemic_class: DecompositionItem['epistemic_class'],
  record_id: string,
  note?: string,
  subject?: Subject,
): DecompositionItem {
  const out: DecompositionItem = { id, quote, epistemic_class, record_id }
  if (note) out.note = note
  if (subject) out.subject = subject
  return out
}

export function decompose(parts: MaterialPart[]): DecompositionResult {
  const clauses: AnalyzedClause[] = []
  const records: StructuredRecord[] = []
  const material = parts.map((p) => p.text).join('\n')
  const materialHasTime = TIME_REFERENCE_RE.test(material)
  let recordN = 0
  let clauseN = 0

  for (const part of parts) {
    for (const sentence of splitSentences(part.text)) {
      recordN++
      const recordId = `OBS-${pad3(recordN)}`
      const cs = splitClauses(sentence).map((c) => analyzeClause(c, `C-${pad3(++clauseN)}`, recordId, part.id))
      clauses.push(...cs)
      const pick = (cat: DecompositionCategory) => unique(cs.filter((c) => c.categories.has(cat)).map((c) => c.text))
      records.push({
        id: recordId,
        source_type: part.source_type,
        time_reference: cs.find((c) => c.time)?.time ?? 'unknown',
        event: pick('events'),
        behavior: pick('behaviors'),
        interpretation: pick('interpretations'),
        emotion: pick('emotions'),
        judgment: pick('judgments'),
        assumptions: unique([...pick('assumptions'), ...pick('expectations')]),
        identity_attribution: pick('identity_attributions'),
        context: unique(cs.flatMap((c) => c.context.map((m) => m.text))),
        unknown_variables: recordUnknowns(cs, materialHasTime),
        evidence_anchors: [sentence.text],
      })
    }
  }

  const d: Decomposition = {
    events: [],
    behaviors: [],
    interpretations: [],
    emotions: [],
    judgments: [],
    assumptions: [],
    expectations: [],
    identity_attributions: [],
    context: [],
    unknowns: [],
  }
  let n = 0
  const nid = (prefix: string) => `${prefix}-${pad3(++n)}`

  for (const c of clauses) {
    if (c.categories.has('events')) {
      d.events.push(item(nid('EV'), c.text, 'DIRECT', c.record_id, c.event ? `Occurrence described (${q(c.event)}).` : 'Described without interpretive expansion.', c.subject))
    }
    if (c.categories.has('behaviors') && c.behavior) {
      const note = c.omission
        ? `Omission described (${q(c.omission)}), attributed to ${SUBJECT_LABEL[c.subject]}.`
        : `Conduct described, attributed to ${SUBJECT_LABEL[c.subject]}.`
      d.behaviors.push(item(nid('BE'), c.text, 'DIRECT', c.record_id, note, c.subject))
    }
    if (c.categories.has('emotions')) {
      const families = unique(c.emotions.map((e) => e.family))
      const words = c.emotions.map((e) => q(e.word)).join(', ')
      if (c.subject === 'self' || c.subject === 'unspecified' || c.subject === 'situation') {
        d.emotions.push(item(nid('EM'), c.text, 'SELF_REPORTED', c.record_id, `Reported by the writer: ${words} (${families.join(', ')}).`, 'self'))
      } else {
        d.emotions.push(
          item(nid('EM'), c.text, 'INFERRED', c.record_id, `Emotion attributed to another person by the writer: ${words}. It is not reported by that person.`, 'other'),
        )
      }
    }
    if (c.categories.has('interpretations')) {
      let note: string
      if (c.interpretiveFeeling) note = `Phrased as a feeling, yet ${q(c.interpretiveFeeling.replace(/^(?:felt|feel|feeling|feels)\s+/i, ''))} describes another person’s conduct or intent rather than an internal state.`
      else if (c.feelLike) note = `${q(c.interpretation ?? 'feel like')} introduces a proposition about the situation rather than an emotion.`
      else if (c.connector === 'because' || c.connector === 'since') note = 'A reason is supplied by the writer; the link is asserted, not observed.'
      else if (c.subject === 'other') note = `Meaning or intent is assigned to another person (${q(c.interpretation ?? c.text)}).`
      else note = `Meaning is assigned (${q(c.interpretation ?? c.text)}).`
      d.interpretations.push(item(nid('IN'), c.text, 'INTERPRETIVE', c.record_id, note, c.subject))
    }
    if (c.categories.has('judgments') && c.judgment) {
      d.judgments.push(item(nid('JU'), c.text, 'INTERPRETIVE', c.record_id, `Evaluation (${q(c.judgment)}) directed at ${SUBJECT_LABEL[c.subject]}.`, c.subject))
    }
    if (c.categories.has('assumptions') && c.assumption) {
      const note = ABSOLUTE_RE.test(c.assumption)
        ? `Absolute term (${q(c.assumption)}): a general claim drawn from particular instances.`
        : `Premise used without verification (${q(c.assumption)}).`
      d.assumptions.push(item(nid('AS'), c.text, 'INTERPRETIVE', c.record_id, note, c.subject))
    }
    if (c.categories.has('expectations') && c.expectation) {
      d.expectations.push(item(nid('EX'), c.text, 'SELF_REPORTED', c.record_id, `Implies a standard for what was supposed to happen (${q(c.expectation)}).`, c.subject))
    }
    if (c.identity) {
      const about = c.identity.about === 'self' ? 'the writer' : 'another person'
      d.identity_attributions.push(
        item(nid('ID'), c.text, 'INTERPRETIVE', c.record_id, `Identity language about ${about} (${q(c.identity.text)}): conduct or feeling stated as what someone is.`, c.identity.about),
      )
    }
    for (const m of c.context) {
      d.context.push(item(nid('CX'), m.text, 'DIRECT', c.record_id, `Context (${m.kind}).`))
    }
  }

  for (const r of records) {
    for (const u of r.unknown_variables) {
      if (!d.unknowns.some((x) => x.note === u)) d.unknowns.push(item(nid('UN'), '', 'UNKNOWN', r.id, u))
    }
  }

  const signature = new Set<string>()
  for (const c of clauses) {
    for (const cat of c.categories) signature.add(`${cat}:${c.subject}`)
    if (c.absolutes.length) signature.add('absolute')
    if (c.interpretiveFeeling) signature.add('interpretive_feeling')
    if (c.identity) signature.add(`identity:${c.identity.about}`)
    for (const e of c.emotions) signature.add(`emotion:${e.family}`)
  }

  return { parts, clauses, records, decomposition: d, signature, material }
}

/** Category signature of arbitrary text, for structural comparison across sources. */
export function signatureOf(text: string): Set<string> {
  return decompose([{ id: 'x', label: 'x', text, source_type: 'general_observation' }]).signature
}
