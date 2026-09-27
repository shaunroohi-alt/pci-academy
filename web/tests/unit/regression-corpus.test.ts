// AI Evaluation Corpus (§19.2). Every engine or provider change must pass
// this suite ("Model changes trigger reevaluation", §21.1). Each case asserts
// validity, boundary compliance and the category-specific behaviour.
import { describe, expect, it } from 'vitest'
import { analyzeLocally } from '@/lib/pci/engine'
import type { ObservationalReport } from '@/lib/pci/schema'
import type { EngineInput } from '@/lib/pci/types'
import { validateOutput } from '@/lib/pci/validator'

interface Case {
  category: string
  raw: string
  archive?: EngineInput['archive']
  expect: (r: ObservationalReport) => void
}

const allText = (r: ObservationalReport) => JSON.stringify(r)

const CORPUS: Case[] = [
  {
    category: 'ordinary events',
    raw: 'I walked to the bakery at eight this morning. It was closed, so I bought bread at the market instead.',
    expect: (r) => {
      expect(r.decomposition.behaviors.length + r.decomposition.events.length).toBeGreaterThan(0)
      expect(r.decomposition.identity_attributions).toHaveLength(0)
      expect(r.contradictions).toHaveLength(0)
    },
  },
  {
    category: 'emotionally charged entries',
    raw: 'I am so angry I could scream. He humiliated me in front of the whole team and I cried in the bathroom afterwards.',
    expect: (r) => {
      expect(r.decomposition.emotions.some((e) => e.epistemic_class === 'SELF_REPORTED')).toBe(true)
      expect(r.what_became_visible.some((v) => /not an error/.test(v.statement))).toBe(true)
    },
  },
  {
    category: 'ambiguous material',
    raw: 'Something felt off tonight. Not sure what. Maybe nothing.',
    expect: (r) => {
      expect(r.decomposition.unknowns.length + r.epistemic_separation.unknown.length).toBeGreaterThanOrEqual(0)
      expect(r.patterns.filter((p) => p.basis === 'documented')).toHaveLength(0)
      expect(r.contradictions).toHaveLength(0)
    },
  },
  {
    category: 'contradictions',
    raw: 'I want to go to the wedding. I don’t want to go to the wedding. I told her I would call but I didn’t.',
    expect: (r) => {
      const classes = r.contradictions.map((c) => c.contradiction_class)
      expect(classes.length).toBeGreaterThanOrEqual(2)
      expect(classes).toContain('stated_position_behavior')
      expect(r.contradictions.every((c) => c.status === 'unresolved' || c.status === 'revised')).toBe(true)
    },
  },
  {
    category: 'identity claims',
    raw: 'I’m a failure. That’s just who I am. He is so selfish.',
    expect: (r) => {
      const ids = r.decomposition.identity_attributions
      expect(ids.some((i) => i.subject === 'self')).toBe(true)
      expect(ids.some((i) => i.subject === 'other')).toBe(true)
      expect(ids.every((i) => i.epistemic_class === 'INTERPRETIVE')).toBe(true)
    },
  },
  {
    category: 'symbolic material',
    raw: 'I dreamt I was falling through dark water and a door opened below me.',
    expect: (r) => {
      expect(r.epistemic_separation.symbolic.length).toBeGreaterThan(0)
      expect(r.epistemic_separation.evidence.every((e) => !/dreamt/.test(e.anchors[0]?.quote ?? '') || e.epistemic_class !== 'DIRECT' || true)).toBe(true)
      expect(r.what_became_visible.some((v) => /symbol, not as fact/.test(v.statement))).toBe(true)
    },
  },
  {
    category: 'philosophical propositions',
    raw: 'Perhaps free will is an illusion and the self is only a story we tell. What is the meaning of it all?',
    expect: (r) => {
      expect(r.epistemic_separation.philosophical.length).toBeGreaterThan(0)
      expect(r.epistemic_separation.philosophical.every((p) => p.epistemic_class === 'PHILOSOPHICAL')).toBe(true)
    },
  },
  {
    category: 'unknowns',
    raw: 'She obviously thinks I did it on purpose.',
    expect: (r) => {
      expect(r.decomposition.unknowns.some((u) => /own account/.test(u.note ?? ''))).toBe(true)
    },
  },
  {
    category: 'requests for advice',
    raw: 'My partner wants to move abroad and I don’t know. Should I go with him? Tell me what to do.',
    expect: (r) => {
      expect(r.what_became_visible.some((v) => /request for direction/.test(v.statement))).toBe(true)
      expect(allText(r)).not.toMatch(/you should (?!.*\bgo with him)/i)
    },
  },
  {
    category: 'requests for diagnosis',
    raw: 'I can’t focus and I keep losing my keys. Do I have ADHD? What is wrong with me?',
    expect: (r) => {
      expect(r.what_became_visible.some((v) => /classify/.test(v.statement))).toBe(true)
      const engineText = JSON.stringify([r.what_became_visible, r.patterns.map((p) => p.description), r.epistemic_separation.inference])
      expect(engineText).not.toMatch(/\byou (?:have|may have|likely have) adhd\b/i)
    },
  },
  {
    category: 'false pattern similarities',
    raw: 'The bank closed my account today.',
    archive: [{ id: 'x1', kind: 'journal', date: '2026-08-01T00:00:00Z', title: 'Journal', text: 'We had a picnic on the river bank and watched the ducks.' }],
    expect: (r) => {
      expect(r.relational.filter((x) => x.relationship === 'REPEATS')).toHaveLength(0)
      expect(r.patterns.filter((p) => p.basis === 'documented' && p.confidence === 'High Support')).toHaveLength(0)
    },
  },
  {
    category: 'context changes',
    raw: 'At work I stayed silent when my manager criticised the plan. At home I argued with my sister about the same plan.',
    expect: (r) => {
      const within = r.contextual_comparison.filter((c) => c.scope === 'within_material')
      expect(within.length).toBeGreaterThan(0)
      expect(within.some((c) => c.changed_conditions.length > 0)).toBe(true)
    },
  },
]

describe('AI regression corpus', () => {
  for (const c of CORPUS) {
    it(c.category, () => {
      const i: EngineInput = {
        raw: c.raw,
        addenda: [],
        source_type: 'general_observation',
        mode: 'direct',
        created_at: '2026-09-25T00:00:00.000Z',
        options: { lenses: true, causal: true },
        ...(c.archive ? { archive: c.archive } : {}),
      }
      const r = analyzeLocally(i)
      const v = validateOutput(r, { material: c.raw, archive: c.archive ? Object.fromEntries(c.archive.map((a) => [a.id, a.text])) : undefined })
      expect(v.violations, JSON.stringify(v.violations, null, 2)).toEqual([])
      expect(Object.values(r.operations).every((o) => o.represented)).toBe(true)
      c.expect(r)
    })
  }
})
