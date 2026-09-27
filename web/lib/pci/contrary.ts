// On the Contrary assist (§3.5, §15). The engine may make the structure of
// the user's own words visible at each step. It never supplies a contrary
// position, a positive reading, or a lesson; balance is not approval; harm
// named by the user stays named.
import { BALANCE_NOTE, CONTRARY_STEPS, HARM_NOTE, type ContraryStepKey } from './canon.ts'
import { decompose } from './decomposition.ts'
import { HARM_RE } from './lexicon.ts'
import { apos, q, unique } from './text.ts'

export interface ContraryAssist {
  step: ContraryStepKey
  observations: string[]
  harm: boolean
  notes: string[]
}

export function contraryAssist(step: ContraryStepKey, steps: Partial<Record<ContraryStepKey, string>>): ContraryAssist {
  const all = CONTRARY_STEPS.map((s) => steps[s.key] ?? '').join('\n')
  const harm = HARM_RE.test(apos(all))
  const notes: string[] = []
  if (harm) notes.push(HARM_NOTE)
  const observations: string[] = []
  const error = steps.identified_error ?? ''
  const d = error.trim() ? decompose([{ id: 'e', label: 'e', text: error, source_type: 'event' }]) : null

  switch (step) {
    case 'identified_error': {
      if (d) {
        const ev = d.decomposition.events.length + d.decomposition.behaviors.length
        const meaning = d.decomposition.interpretations.length + d.decomposition.judgments.length
        observations.push(`The description contains ${ev} described occurrence${ev === 1 ? '' : 's'} and ${meaning} statement${meaning === 1 ? '' : 's'} of meaning or evaluation.`)
        for (const j of d.decomposition.judgments.slice(0, 2)) observations.push(`Evaluation present: ${q(j.quote)}.`)
      }
      break
    }
    case 'implied_expectation': {
      if (d) {
        const exp = d.clauses.filter((c) => c.expectation)
        if (exp.length) exp.slice(0, 3).forEach((c) => observations.push(`Expectation language in the identified error: ${q(c.expectation!)} (in ${q(c.text)}).`))
        else observations.push('No explicit expectation language appears in the identified error. The expectation, if any, is implicit.')
        for (const a of d.decomposition.assumptions.slice(0, 2)) observations.push(`Premise used without verification: ${q(a.quote)}.`)
      }
      break
    }
    case 'missing_variables': {
      const text = [steps.identified_error, steps.implied_expectation].filter(Boolean).join('\n')
      if (text.trim()) {
        const dd = decompose([{ id: 'm', label: 'm', text, source_type: 'event' }])
        for (const u of dd.decomposition.unknowns.slice(0, 5)) observations.push(u.note ?? '')
        if (!dd.decomposition.context.length) observations.push('No context (place, people present, time, state) is stated yet.')
      }
      break
    }
    case 'system_relationship': {
      const text = [steps.identified_error, steps.missing_variables].filter(Boolean).join('\n')
      if (text.trim()) {
        const dd = decompose([{ id: 's', label: 's', text, source_type: 'event' }])
        const parts = unique(dd.clauses.flatMap((c) => c.context.map((m) => m.text)))
        const actors = unique(dd.clauses.filter((c) => c.subject === 'other').map((c) => c.text.split(/\s+/).slice(0, 2).join(' ')))
        if (parts.length) observations.push(`Parts of the system named so far: ${parts.slice(0, 6).map(q).join(', ')}.`)
        if (actors.length) observations.push(`Other participants appear in: ${actors.slice(0, 4).map(q).join(', ')}.`)
        if (!parts.length && !actors.length) observations.push('Only the writer’s position is described so far.')
      }
      break
    }
    case 'contrary_position': {
      observations.push('The contrary position is written from inside the same system, from another place in it. It is described, not adopted.')
      break
    }
    case 'balance': {
      notes.push(BALANCE_NOTE)
      break
    }
  }
  return { step, observations: observations.filter(Boolean), harm, notes }
}

/** The whole session as material for a PCI observation. */
export function contraryMaterial(steps: Partial<Record<ContraryStepKey, string>>): string {
  return CONTRARY_STEPS.filter((s) => steps[s.key]?.trim())
    .map((s) => `${s.name}: ${steps[s.key]!.trim()}`)
    .join('\n\n')
}
