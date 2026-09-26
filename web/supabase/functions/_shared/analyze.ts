// Analyse with one repair round. Pure: no HTTP, no Supabase, no provider —
// testable with a fake adapter.
import { repairMessage, systemContract, userMessage } from './pci/contract.ts'
import { materialText } from './pci/engine.ts'
import { reportModelSchema } from './pci/provider-schema.ts'
import { ObservationalReportSchema, type Violation } from './pci/schema.ts'
import type { EngineInput } from './pci/types.ts'
import { validateOutput } from './pci/validator.ts'
import type { ModelAdapter, ModelTurn } from './model.ts'

export interface AnalyzeResult {
  output: unknown
  servedBy: string
  rounds: number
  violations: Violation[]
}

export function checkOutput(out: unknown, input: EngineInput): Violation[] {
  const material = materialText(input)
  const archive = input.archive ? Object.fromEntries(input.archive.map((s) => [s.id, s.text])) : undefined
  const shape = ObservationalReportSchema.safeParse(out)
  const issues: Violation[] = shape.success
    ? []
    : shape.error.issues.slice(0, 15).map((i) => ({ rule: 'schema.invalid', invariant: 'structured output', path: `$.${i.path.join('.')}`, excerpt: i.message }))
  return [...issues, ...validateOutput(out, { material, archive }).violations]
}

export async function analyzeWithRepair(adapter: ModelAdapter, input: EngineInput): Promise<AnalyzeResult> {
  const system = systemContract()
  const schema = reportModelSchema()
  const messages: ModelTurn[] = [{ role: 'user', content: userMessage(input) }]
  let result = await adapter.generate({ system, messages, schema })
  let violations = checkOutput(result.json, input)
  if (!violations.length) return { output: result.json, servedBy: result.servedBy, rounds: 1, violations }
  // One repair round; anything still violating is returned for quarantine.
  messages.push({ role: 'assistant', content: result.text }, { role: 'user', content: repairMessage(violations) })
  result = await adapter.generate({ system, messages, schema })
  violations = checkOutput(result.json, input)
  return { output: result.json, servedBy: result.servedBy, rounds: 2, violations }
}
