// On the Contrary writer (§3.5, §15). Writes the Contrary Position or the
// Balance as readable prose from the user's own session. The PCI boundary
// still holds: the draft describes a position without adopting it, keeps
// harm named, gives no advice, and balance is not approval. Every draft is
// scanned by the constitutional validator, with one repair round.
import { BALANCE_NOTE, CONTRARY_STEPS, HARM_NOTE, type ContraryStepKey } from '../lib/pci/canon.ts'
import { HARM_RE } from '../lib/pci/lexicon.ts'
import { apos } from '../lib/pci/text.ts'
import { scanText } from '../lib/pci/validator.ts'
import type { Violation } from '../lib/pci/schema.ts'

export type WritableStep = Extract<ContraryStepKey, 'contrary_position' | 'balance'>
export const WRITABLE_STEPS: readonly WritableStep[] = ['contrary_position', 'balance']

export type ContrarySteps = Partial<Record<ContraryStepKey, string>>

export interface WriteRequest {
  step: WritableStep
  title?: string
  steps: ContrarySteps
}

export interface WriteResult {
  text: string
  violations: Violation[]
  rounds: number
}

export interface Turn {
  role: 'user' | 'assistant'
  content: string
}

/** Turns (system, messages) into the model's prose reply. */
export type Generate = (args: { system: string; messages: Turn[] }) => Promise<string>

export const MAX_FIELD_CHARS = 8000

export const CONTRARY_WRITER_SYSTEM = `You write one part of an "On the Contrary" session for PCI Academy. PCI (Psycho-Creative Intelligence) is an observational framework: it makes visible how a situation is put together, and then it stops.

In an On the Contrary session the user works through six steps about something they experienced as an error: Identified Error, Implied Expectation, Missing Variables, System Relationship, Contrary Position, Balance. You are given everything the user has written so far and asked to write either the Contrary Position or the Balance for them to read.

Contrary Position: write how the same material appears from another position inside the same system. Choose the position the user's material makes most available (another participant, the conditions, the wider arrangement they named) and say which position you are writing from. Describe that view from the inside, with its own expectations, pressures and missing information. It is described, not adopted: you are not saying it is correct, and you are not arguing against the user.

Balance: write what relationship between the parts becomes visible when the whole system is held at once, including the user's position and the contrary one. ${BALANCE_NOTE}

Rules that always hold:
- Work only from the user's material. Where you go beyond what they wrote, say so plainly ("this is not in what you wrote, but it is possible that...") and keep it tentative.
- ${HARM_NOTE} Never minimise, excuse, or reframe harm as deserved, useful, or meant to be.
- No forced positivity: never say it happened for a reason, was a blessing, a lesson, a gift, or an opportunity for growth.
- No advice, instructions, next steps, or "you should/could". No diagnosis, no verdict on anyone's character, no ranking of who was right.
- Do not assert what caused what; describe what the material shows and what it leaves open. Avoid certainty words (clearly, obviously, definitely, always, never) and clinical or pathologising words (toxic, disorder, trauma, in denial, overreacting).
- When you quote the user, quote them exactly, in double quotes.

Write plain, warm, readable prose addressed to the user as "you": two to four short paragraphs, no headings, no lists, no preamble, no closing summary. Output only the prose.`

const clip = (s: string) => (s.length > MAX_FIELD_CHARS ? `${s.slice(0, MAX_FIELD_CHARS)}…` : s)

/** The session as written so far, step by step. */
export function sessionMaterial(steps: ContrarySteps): string {
  return CONTRARY_STEPS.filter((s) => steps[s.key]?.trim())
    .map((s) => `${s.name}: ${steps[s.key]!.trim()}`)
    .join('\n\n')
}

export function buildUserMessage(req: WriteRequest): string {
  const target = CONTRARY_STEPS.find((s) => s.key === req.step)!
  const written = CONTRARY_STEPS.filter((s) => s.key !== req.step && req.steps[s.key]?.trim()).map(
    (s) => `<step name="${s.name}">\n${clip(req.steps[s.key]!.trim())}\n</step>`,
  )
  const own = req.steps[req.step]?.trim()
  const harm = HARM_RE.test(apos(sessionMaterial(req.steps)))
  return [
    req.title?.trim() ? `Session title: ${clip(req.title.trim())}` : null,
    `The user's session so far:\n${written.join('\n\n')}`,
    own ? `The user has started their own ${target.name} (draw on it, do not repeat it):\n<draft>\n${clip(own)}\n</draft>` : null,
    harm ? 'The material names harm. It stays named.' : null,
    `Write the ${target.name}. The step's question is: ${target.prompt}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** True when there is enough material to write from. */
export function hasMaterial(steps: ContrarySteps, step: WritableStep): boolean {
  return CONTRARY_STEPS.some((s) => s.key !== step && (steps[s.key]?.trim().length ?? 0) > 0)
}

export function parseWriteRequest(body: unknown): WriteRequest | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (!WRITABLE_STEPS.includes(b.step as WritableStep)) return null
  if (!b.steps || typeof b.steps !== 'object') return null
  const steps: ContrarySteps = {}
  for (const s of CONTRARY_STEPS) {
    const v = (b.steps as Record<string, unknown>)[s.key]
    if (typeof v === 'string') steps[s.key] = v.slice(0, MAX_FIELD_CHARS)
  }
  return { step: b.step as WritableStep, title: typeof b.title === 'string' ? b.title.slice(0, 200) : undefined, steps }
}

/** Writes the step, validates it against the PCI boundary, and repairs once. */
export async function writeContrary(generate: Generate, req: WriteRequest): Promise<WriteResult> {
  const material = sessionMaterial(req.steps)
  const messages: Turn[] = [{ role: 'user', content: buildUserMessage(req) }]
  let text = (await generate({ system: CONTRARY_WRITER_SYSTEM, messages })).trim()
  let violations = scanText(text, material)
  if (!violations.length) return { text, violations, rounds: 1 }

  messages.push({ role: 'assistant', content: text })
  messages.push({
    role: 'user',
    content: `That draft crosses the PCI boundary here:\n${violations.map((v) => `- ${v.rule}: "${v.excerpt}"`).join('\n')}\nRewrite the whole piece without that language. Output only the prose.`,
  })
  text = (await generate({ system: CONTRARY_WRITER_SYSTEM, messages })).trim()
  violations = scanText(text, material)
  return { text, violations, rounds: 2 }
}
