import { describe, expect, it } from 'vitest'
import { MemoryStore } from '@/lib/db/docstore'
import { Repository } from '@/lib/db/repository'
import { reflectRequest } from '@/lib/ai/reflection-writer'
import { analyzeLocally } from '@/lib/pci/engine'
import type { Generate, Turn } from '@/worker/contrary'
import worker, { type Env } from '@/worker/index'
import { buildReflectMessage, parseReflectRequest, parseWriteup, REFLECT_WRITER_SYSTEM, writeReflection } from '@/worker/reflect'

const material = 'I snapped at my brother at dinner. I was tired and I always do this when I am tired.'
const req = { kind: 'Journal entry', parts: [{ label: 'Original input', text: material }], findings: ['Absolute terms appear ("always").'] }
const good = '<observation>\nAt dinner you snapped at your brother. You were tired.\n</observation>\n<analysis>\nYou wrote "I always do this when I am tired". This evening is the one the material shows.\n</analysis>'

describe('Reflection writer', () => {
  it('writes the observation and analysis as prose from the material and findings', async () => {
    let seen: { system: string; messages: Turn[] } | null = null
    const generate: Generate = async (args) => {
      seen = args
      return good
    }
    const r = await writeReflection(generate, req)
    expect(r.rounds).toBe(1)
    expect(r.violations).toEqual([])
    expect(r.observation).toMatch(/snapped at your brother/)
    expect(r.analysis).toMatch(/the one the material shows/)
    expect(seen!.system).toBe(REFLECT_WRITER_SYSTEM)
    expect(seen!.messages[0].content).toContain(material)
    expect(seen!.messages[0].content).toContain('Absolute terms appear')
    expect(seen!.messages[0].content).toContain('Comparison with earlier material is off')
  })

  it('repairs a write-up that crosses the boundary or is incomplete, once', async () => {
    const replies = ['<observation>You should apologise to him.</observation><analysis>It happened for a reason.</analysis>', good]
    const calls: Turn[][] = []
    const r = await writeReflection(async ({ messages }) => {
      calls.push([...messages])
      return replies.shift()!
    }, req)
    expect(r.rounds).toBe(2)
    expect(r.violations).toEqual([])
    expect(calls[1].at(-1)!.content).toMatch(/prescription\.directive/)

    const missing = await writeReflection(async () => 'Just some text.', req)
    expect(missing.observation).toBe('')
    expect(missing.rounds).toBe(2)
  })

  it('includes only earlier material the engine compared against, and names it by date', () => {
    const msg = buildReflectMessage({ ...req, earlier: [{ date: '2026-06-01T09:00:00Z', title: 'Journal', text: 'Tired again at work.' }] })
    expect(msg).toContain('date="2026-06-01"')
    expect(msg).not.toContain('Comparison with earlier material is off')
  })

  it('parses tagged output and validates requests', () => {
    expect(parseWriteup(good).observation).toMatch(/^At dinner/)
    expect(parseReflectRequest({ parts: [] })).toBeNull()
    expect(parseReflectRequest({ parts: [{ text: 'x' }] })?.parts[0].label).toBe('Material')
  })
})

describe('Reports carry the written observation and analysis', () => {
  it('stores the write-up on the version, or why it is missing', async () => {
    const provider = () => ({ id: 'local', model: 'test', analyze: async (i: Parameters<typeof analyzeLocally>[0]) => analyzeLocally(i) })
    const ok = new Repository({ store: new MemoryStore(), provider, writer: () => async () => ({ observation: 'O', analysis: 'A', model: 'm', violations: [] }) })
    const o = await ok.createObservation({ raw: material, mode: 'direct', source_type: 'event' })
    const v = await ok.analyze(o.id)
    expect(v.writeup).toEqual({ observation: 'O', analysis: 'A', model: 'm', violations: [] })

    const failing = new Repository({
      store: new MemoryStore(),
      provider,
      writer: () => async () => {
        throw new Error('The writer is not configured for this site yet.')
      },
    })
    const f = await failing.createObservation({ raw: material, mode: 'direct', source_type: 'event' })
    const fv = await failing.analyze(f.id)
    expect(fv.status).toBe('valid')
    expect(fv.writeup).toBeUndefined()
    expect(fv.writeup_error).toMatch(/not configured/)

    const off = new Repository({ store: new MemoryStore(), provider, writer: () => undefined })
    const x = await off.createObservation({ raw: material, mode: 'direct', source_type: 'event' })
    const xv = await off.analyze(x.id)
    expect(xv.writeup).toBeUndefined()
    expect(xv.writeup_error).toBeUndefined()
  })

  it('builds the writer request from the material and the findings', async () => {
    const input = { raw: material, addenda: [], source_type: 'journal_entry' as const, mode: 'direct' as const, created_at: '2026-09-25T09:00:00Z', options: { lenses: false, causal: false } }
    const report = analyzeLocally(input)
    const r = reflectRequest(input, report)
    expect(r.parts[0].text).toBe(material)
    expect(r.findings.length).toBeGreaterThan(0)
    expect(r.earlier).toBeUndefined()
  })
})

describe('Worker /api/reflect', () => {
  const env = (over: Partial<Env> = {}): Env => ({ ASSETS: { fetch: async () => new Response('asset') }, ...over })
  it('says when the writer has no key, and refuses other origins', async () => {
    const post = (headers: Record<string, string> = {}) =>
      new Request('https://pci.academy/api/reflect', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(req) })
    expect((await worker.fetch(post(), env())).status).toBe(501)
    expect((await worker.fetch(post({ Origin: 'https://evil.example' }), env({ ANTHROPIC_API_KEY: 'k' }))).status).toBe(403)
  })
})
