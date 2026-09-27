import { describe, expect, it } from 'vitest'
import { occursIn, redact, validateOutput, validateText } from '@/lib/pci/validator'

describe('Constitutional validator — the blueprint’s examples (§8.3)', () => {
  const blocked = [
    'You should talk to your manager tomorrow.',
    'You need to set clearer boundaries.',
    'You must stop apologising.',
    'The right thing is to apologise.',
    'This means you are avoidant.',
    'Your true self is creative.',
    'You suffer from anxiety.',
    'The solution is to leave.',
    'You need to heal this wound.',
    'This pattern proves an origin in childhood.',
  ]
  for (const text of blocked) {
    it(`blocks: “${text}”`, () => {
      expect(validateText(text).ok).toBe(false)
    })
  }
})

describe('Constitutional validator — each invariant', () => {
  const cases: [string, string][] = [
    ['correlation → causation', 'Your anxiety stems from the deadline.'],
    ['behavior → permanent identity', 'This shows that you are a people-pleaser.'],
    ['identity language → ontology', 'Deep down, you are essentially kind.'.replace('Deep down, you are essentially', 'You are essentially')],
    ['confidence → certainty', 'This is definitely a recurring pattern.'],
    ['confidence → certainty', 'Confidence: 87% that this repeats.'],
    ['contradiction → pathology', 'Saying one thing and doing another is hypocrisy.'],
    ['emotion → error', 'You overreacted to a small comment.'],
    ['pattern → diagnosis', 'These are symptoms of burnout.'],
    ['visibility → obligation', 'Now that you see this, it is time to change.'],
    ['observation → prescription', 'Consider journaling about it every night.'],
    ['observation → prescription', 'I recommend a conversation with her.'],
    ['observation → prescription', 'It would help to rest more.'],
    ['observation → prescription', 'Everything happens for a reason.'],
    ['observation → prescription', 'You attracted this into your life.'],
    ['symbol → fact', 'The dream is telling you to leave.'],
  ]
  for (const [inv, text] of cases) {
    it(`${inv}: “${text}”`, () => {
      const r = validateText(text)
      expect(r.ok, JSON.stringify(r.violations)).toBe(false)
    })
  }
})

describe('Constitutional validator — observational language passes', () => {
  const allowed = [
    'Intent is assigned to another person twice; that person’s own account does not appear in the material.',
    'Absolute terms appear. The material documents the present instance, not the others it refers to.',
    'Emotion is reported (anger) alongside evaluation. The emotion is part of the material, not an error in it.',
    'A request for direction is present. It is kept as material; the PCI Engine does not answer it.',
    'Recurrence does not establish origin. No adoption pathway is inferred from repetition alone.',
    'PCI boundary reached: the report ends at observation. No prescription is generated.',
  ]
  for (const text of allowed) {
    it(`allows: “${text.slice(0, 60)}…”`, () => {
      const r = validateText(text)
      expect(r.ok, JSON.stringify(r.violations)).toBe(true)
    })
  }
})

describe('User material is evidence, not engine speech', () => {
  const material = 'My mother said “you should just get over it” and I felt dismissed.'

  it('allows a note that quotes the user’s own words verbatim', () => {
    const r = validateText('The material quotes an instruction received (“you should just get over it”).', material)
    expect(r.ok).toBe(true)
  })

  it('does not exempt quoted text that is not in the material', () => {
    const r = validateText('The engine adds “you should call her”.', material)
    expect(r.ok).toBe(false)
  })

  it('rejects anchors that do not occur in the material', () => {
    const out = { decomposition: { events: [{ id: 'EV-1', quote: 'She slammed the door.', epistemic_class: 'DIRECT' }] } }
    const r = validateOutput(out, { material })
    expect(r.violations.map((v) => v.rule)).toContain('evidence.unanchored_quote')
  })

  it('accepts anchors that do occur, ignoring case, spacing and quote style', () => {
    expect(occursIn('MY MOTHER said  "you should just get over it"', material)).toBe(true)
  })

  it('flags forbidden fields by name', () => {
    const r = validateOutput({ next_steps: ['x'], advice: 'y' }, { material })
    expect(r.violations.filter((v) => v.rule === 'schema.forbidden_field')).toHaveLength(2)
  })
})

describe('Logging redaction (§9.1)', () => {
  it('removes user material but keeps identifiers', () => {
    expect(redact({ id: 'o1', raw: 'private words', status: 'valid' })).toEqual({ id: 'o1', raw: '[redacted:13]', status: 'valid' })
  })
})
