// Reflection writer (Observe and Journal). Writes the observation and the
// analysis of a report as readable prose, from the user's material and the
// engine's findings. The PCI boundary still holds: no advice, no diagnosis,
// no causal verdicts, emotion is not error, harm stays named. Both parts are
// scanned by the constitutional validator, with one repair round.
import { HARM_NOTE } from '../lib/pci/canon.ts'
import { HARM_RE } from '../lib/pci/lexicon.ts'
import { apos } from '../lib/pci/text.ts'
import { scanText } from '../lib/pci/validator.ts'
import type { Violation } from '../lib/pci/schema.ts'
import type { Generate, Turn } from './contrary.ts'

export const MAX_MATERIAL_CHARS = 16000
export const MAX_FINDINGS = 40
export const MAX_EARLIER = 8
export const MAX_EARLIER_CHARS = 2500

export interface ReflectPart {
  label: string
  text: string
}

export interface EarlierSource {
  date: string
  title: string
  text: string
}

export interface ReflectRequest {
  /** Human label for the kind of material, e.g. "Journal entry". */
  kind: string
  parts: ReflectPart[]
  /** Statements the engine produced (what became visible, patterns, tensions). */
  findings: string[]
  /** Earlier material the engine compared against; present only with the user's permission. */
  earlier?: EarlierSource[]
}

export interface Writeup {
  observation: string
  analysis: string
}

export interface ReflectResult extends Writeup {
  violations: Violation[]
  rounds: number
}

export const REFLECT_WRITER_SYSTEM = `You write the observation and the analysis in a PCI report for PCI Academy. PCI (Psycho-Creative Intelligence) is an observational framework: it makes visible how a situation is put together, and then it stops.

You are given the person's own material (a journal entry, an event, a conversation, and so on), the findings the PCI Engine has already separated out of it, and sometimes earlier dated material the person has allowed you to compare against. Write two parts for the person to read.

Observation: tell back what is in the material, in prose. Say what occurred and what was done, then, held apart from that, what was felt, what meaning was given to it, what was expected, and what is not known. Quote the person's own words where they carry the weight, exactly and in double quotes. This is careful description, not a summary of their character.

Analysis: write what becomes visible when those parts are held apart and compared. Where does meaning outweigh what is described? What expectation shapes the account? Where do absolutes ("always", "never") reach beyond the instance at hand? What tensions sit side by side, left unresolved? What recurs? When earlier material is given, say what recurs or has shifted across it, naming the dates. Ground the analysis in the engine's findings; you may notice more than they do, but anything beyond what the material shows is marked as tentative ("this is not in what you wrote, but it is possible that...").

Rules that always hold:
- No advice, instructions, next steps, or "you should/could/might want to". If the material asks for advice, a decision or a diagnosis, say that the request is there and that PCI does not answer it.
- No diagnosis, no condition or disorder names, no verdict on anyone's character, no statement of what someone "is" or their "true self".
- Do not assert what caused what. Order of events is not mechanism; recurrence is not origin.
- Emotion is part of the material, never an error in it. A contradiction is a tension, not a fault.
- ${HARM_NOTE} Never minimise, excuse, or reframe harm as deserved, useful, or meant to be. No forced positivity: never say it happened for a reason, was a blessing, a lesson, a gift, or an opportunity for growth.
- Avoid certainty words (clearly, obviously, definitely) and clinical or pathologising words (toxic, trauma, in denial, overreacting).
- Never mention other people's inner states as fact; when the material assigns intent to someone, say it is the person's reading.

Write plain, warm, readable prose addressed to the person as "you". The observation is two or three short paragraphs; the analysis is three to five. No headings, lists or preamble inside either part, and no closing summary or encouragement: the report ends at observation.

Answer in exactly this form and nothing else:
<observation>
...
</observation>
<analysis>
...
</analysis>`

const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '')

export function parseReflectRequest(body: unknown): ReflectRequest | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (!Array.isArray(b.parts)) return null
  let budget = MAX_MATERIAL_CHARS
  const parts: ReflectPart[] = []
  for (const p of b.parts.slice(0, 20)) {
    if (!p || typeof p !== 'object') continue
    const text = str((p as Record<string, unknown>).text, budget).trim()
    if (!text) continue
    budget -= text.length
    parts.push({ label: str((p as Record<string, unknown>).label, 120) || 'Material', text })
    if (budget <= 0) break
  }
  if (!parts.length) return null
  const findings = Array.isArray(b.findings) ? b.findings.map((f) => str(f, 600).trim()).filter(Boolean).slice(0, MAX_FINDINGS) : []
  const earlier = Array.isArray(b.earlier)
    ? b.earlier
        .slice(0, MAX_EARLIER)
        .map((e) => {
          const r = (e ?? {}) as Record<string, unknown>
          return { date: str(r.date, 40), title: str(r.title, 200), text: str(r.text, MAX_EARLIER_CHARS).trim() }
        })
        .filter((e) => e.text)
    : undefined
  return { kind: str(b.kind, 80) || 'Material', parts, findings, ...(earlier?.length ? { earlier } : {}) }
}

export function reflectMaterial(req: ReflectRequest): string {
  return req.parts.map((p) => p.text).join('\n')
}

export function buildReflectMessage(req: ReflectRequest): string {
  const harm = HARM_RE.test(apos(reflectMaterial(req)))
  return [
    `Kind of material: ${req.kind}`,
    `The person's material:\n${req.parts.map((p) => `<material label="${p.label}">\n${p.text}\n</material>`).join('\n\n')}`,
    req.findings.length ? `What the PCI Engine has already made visible:\n${req.findings.map((f) => `- ${f}`).join('\n')}` : null,
    req.earlier?.length
      ? `Earlier material the person allowed you to compare against:\n${req.earlier.map((e) => `<earlier date="${e.date.slice(0, 10)}" title="${e.title}">\n${e.text}\n</earlier>`).join('\n\n')}`
      : 'Comparison with earlier material is off. Do not refer to anything earlier.',
    harm ? 'The material names harm. It stays named.' : null,
    'Write the observation and the analysis.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

const section = (text: string, tag: string) => text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]?.trim() ?? ''

export function parseWriteup(text: string): Writeup {
  return { observation: section(text, 'observation'), analysis: section(text, 'analysis') }
}

function check(w: Writeup, material: string): Violation[] {
  return [...scanText(w.observation, material, '$.observation'), ...scanText(w.analysis, material, '$.analysis')]
}

/** Writes the observation and analysis, validates both against the PCI boundary, and repairs once. */
export async function writeReflection(generate: Generate, req: ReflectRequest): Promise<ReflectResult> {
  const material = [reflectMaterial(req), ...(req.earlier ?? []).map((e) => e.text)].join('\n')
  const messages: Turn[] = [{ role: 'user', content: buildReflectMessage(req) }]
  let raw = await generate({ system: REFLECT_WRITER_SYSTEM, messages })
  let w = parseWriteup(raw)
  let violations = check(w, material)
  if (w.observation && w.analysis && !violations.length) return { ...w, violations, rounds: 1 }

  messages.push({ role: 'assistant', content: raw })
  const problems = [
    ...(!w.observation || !w.analysis ? ['- format: both <observation> and <analysis> must be present'] : []),
    ...violations.map((v) => `- ${v.rule}: "${v.excerpt}"`),
  ]
  messages.push({
    role: 'user',
    content: `That draft needs another pass:\n${problems.join('\n')}\nWrite both parts again without that language, in the same tagged form.`,
  })
  raw = await generate({ system: REFLECT_WRITER_SYSTEM, messages })
  w = parseWriteup(raw)
  violations = check(w, material)
  return { ...w, violations, rounds: 2 }
}
