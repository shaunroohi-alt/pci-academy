import { describe, expect, it } from 'vitest'
import { repairMessage, systemContract, userMessage } from '@/lib/pci/contract'
import { reportModelSchema } from '@/lib/pci/provider-schema'
import { EngineInputSchema } from '@/lib/pci/schema'

function walk(node: unknown, visit: (o: Record<string, unknown>) => void) {
  if (Array.isArray(node)) node.forEach((n) => walk(n, visit))
  else if (node && typeof node === 'object') {
    visit(node as Record<string, unknown>)
    Object.values(node).forEach((v) => walk(v, visit))
  }
}

describe('Model-facing report schema', () => {
  const schema = reportModelSchema()

  it('closes every object and uses only supported keywords', () => {
    const bad = ['minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'prefixItems', 'minItems', 'maxItems']
    walk(schema, (o) => {
      for (const k of bad) expect(o, k).not.toHaveProperty(k)
      if (o.type === 'object') expect(o.additionalProperties).toBe(false)
    })
  })

  it('still has no field for prescriptions', () => {
    const json = JSON.stringify(schema)
    for (const f of ['recommendation', 'treatment', 'action_plan', 'personality_score', 'diagnosis']) expect(json).not.toContain(`"${f}"`)
  })

  it('requires the exact boundary statement', () => {
    expect(JSON.stringify(schema)).toContain('PCI boundary reached: the report ends at observation. No prescription is generated.')
  })
})

describe('PCI contract', () => {
  it('states all seven operations and the prohibited transformations', () => {
    const c = systemContract()
    for (const op of ['Input', 'Decomposition', 'Contextual Comparison', 'Pattern Detection', 'Contradiction Detection', 'Evidentiary Separation', 'Observational Report']) expect(c).toContain(op)
    expect(c).toContain('observation -> prescription')
  })

  it('tells the model when longitudinal comparison is off', () => {
    const m = userMessage({ raw: 'x', addenda: [], source_type: 'event', mode: 'direct', created_at: '2026-09-25', options: { lenses: false, causal: false } })
    expect(m).toContain('Longitudinal comparison is OFF')
  })
})

describe('Engine request validation', () => {
  it('rejects oversized or malformed requests before any model call', () => {
    expect(EngineInputSchema.safeParse({ raw: '', addenda: [], source_type: 'event', mode: 'direct', created_at: 'x', options: { lenses: false, causal: false } }).success).toBe(false)
    expect(EngineInputSchema.safeParse({ raw: 'a'.repeat(50001), addenda: [], source_type: 'event', mode: 'direct', created_at: 'x', options: { lenses: false, causal: false } }).success).toBe(false)
    expect(EngineInputSchema.safeParse({ raw: 'ok', addenda: [], source_type: 'event', mode: 'direct', created_at: 'x', options: { lenses: false, causal: false }, extra: 1 }).success).toBe(false)
  })

  it('a repair round names each rejected path and invariant', () => {
    const m = repairMessage([{ rule: 'prescription.directive', invariant: 'observation → prescription', path: '$.what_became_visible[0].statement', excerpt: 'You should talk to her' }])
    expect(m).toContain('$.what_became_visible[0].statement')
    expect(m).toContain('observation → prescription')
  })
})
