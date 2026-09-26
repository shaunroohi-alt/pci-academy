// deno test supabase/functions/_shared/analyze.test.ts
import { analyzeWithRepair } from './analyze.ts'
import { analyzeLocally } from './pci/engine.ts'
import type { EngineInput } from './pci/types.ts'
import type { ModelAdapter, ModelTurn } from './model.ts'

const input: EngineInput = {
  raw: 'I said I would call her but I didn’t. I felt ignored when she walked past.',
  addenda: [],
  source_type: 'event',
  mode: 'direct',
  created_at: '2026-09-25T10:00:00.000Z',
  options: { lenses: false, causal: false },
}

function fake(outputs: unknown[]): ModelAdapter & { calls: ModelTurn[][] } {
  const calls: ModelTurn[][] = []
  return {
    provider: 'fake',
    model: 'fake-1',
    calls,
    async generate({ messages }) {
      calls.push([...messages])
      const json = outputs[Math.min(calls.length - 1, outputs.length - 1)]
      return { json, text: JSON.stringify(json), servedBy: 'fake-1' }
    },
  }
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

const good = analyzeLocally(input)
const prescriptive = { ...good, what_became_visible: [...good.what_became_visible, { id: 'V-X', statement: 'You should call her tomorrow.', supports: ['OBS-001'] }] }

Deno.test('valid output passes in one round', async () => {
  const a = fake([good])
  const r = await analyzeWithRepair(a, input)
  assert(r.rounds === 1 && r.violations.length === 0, 'expected a clean single round')
})

Deno.test('a prescriptive output gets one repair round with the violations named', async () => {
  const a = fake([prescriptive, good])
  const r = await analyzeWithRepair(a, input)
  assert(r.rounds === 2 && r.violations.length === 0, 'expected repair to succeed')
  const repair = a.calls[1].at(-1)!.content
  assert(repair.includes('observation → prescription'), 'repair prompt should name the invariant')
})

Deno.test('an output that still violates after repair is returned with its violations', async () => {
  const a = fake([prescriptive, prescriptive])
  const r = await analyzeWithRepair(a, input)
  assert(r.rounds === 2 && r.violations.some((v) => v.rule.startsWith('prescription')), 'expected violations to be reported')
})
