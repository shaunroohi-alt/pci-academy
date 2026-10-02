import { describe, expect, it } from 'vitest'
import { buildUserMessage, CONTRARY_WRITER_SYSTEM, hasMaterial, parseWriteRequest, writeContrary, type Generate, type Turn } from '@/worker/contrary'
import worker, { type Env } from '@/worker/index'

const steps = {
  identified_error: 'My colleague took credit for my report in the meeting. It was unfair and he should have mentioned me.',
  implied_expectation: 'I expected to be named.',
  system_relationship: 'The team, our manager, a deadline that week.',
}

describe('On the Contrary writer', () => {
  it('writes the step as prose from the session', async () => {
    let seen: { system: string; messages: Turn[] } | null = null
    const generate: Generate = async (args) => {
      seen = args
      return 'From where your colleague stood, the deadline was the whole room.\n\nThis is not in what you wrote, but it is possible he was speaking for the team.'
    }
    const r = await writeContrary(generate, { step: 'contrary_position', steps })
    expect(r.rounds).toBe(1)
    expect(r.violations).toEqual([])
    expect(r.text).toMatch(/From where your colleague stood/)
    expect(seen!.system).toBe(CONTRARY_WRITER_SYSTEM)
    expect(seen!.messages[0].content).toContain('I expected to be named.')
    expect(seen!.messages[0].content).toContain('Write the Contrary Position')
  })

  it('repairs a draft that crosses the PCI boundary once, then reports what remains', async () => {
    const replies = ['It happened for a reason, and you should talk to him.', 'Seen from the manager’s place, the meeting was about the deadline.']
    const calls: Turn[][] = []
    const generate: Generate = async ({ messages }) => {
      calls.push([...messages])
      return replies.shift()!
    }
    const r = await writeContrary(generate, { step: 'balance', steps })
    expect(r.rounds).toBe(2)
    expect(r.violations).toEqual([])
    expect(calls[1].at(-1)!.content).toMatch(/contrary\.forced_positivity|prescription\.directive/)

    const stubborn: Generate = async () => 'Everything happens for a reason.'
    const s = await writeContrary(stubborn, { step: 'balance', steps })
    expect(s.violations.map((v) => v.rule)).toContain('contrary.forced_positivity')
  })

  it('keeps named harm named in the request', () => {
    const msg = buildUserMessage({ step: 'contrary_position', steps: { identified_error: 'He hit me during the argument.' } })
    expect(msg).toMatch(/names harm/)
  })

  it('accepts only the two writable steps and needs earlier material', () => {
    expect(parseWriteRequest({ step: 'identified_error', steps })).toBeNull()
    expect(parseWriteRequest({ step: 'balance' })).toBeNull()
    const req = parseWriteRequest({ step: 'balance', steps: { ...steps, extra: 'x', balance: 42 } })
    expect(req?.steps).toEqual(steps)
    expect(hasMaterial({ balance: 'only this' }, 'balance')).toBe(false)
    expect(hasMaterial(steps, 'balance')).toBe(true)
  })
})

describe('Worker routing', () => {
  const env = (over: Partial<Env> = {}): Env => ({ ASSETS: { fetch: async () => new Response('asset') }, ...over })

  it('serves assets for everything outside /api', async () => {
    const res = await worker.fetch(new Request('https://pci.academy/contrary/'), env())
    expect(await res.text()).toBe('asset')
  })

  it('says when the writer has no key, and refuses other origins', async () => {
    const post = (headers: Record<string, string> = {}) =>
      new Request('https://pci.academy/api/contrary', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ step: 'balance', steps }) })
    expect((await worker.fetch(post(), env())).status).toBe(501)
    expect((await worker.fetch(post({ Origin: 'https://evil.example' }), env({ ANTHROPIC_API_KEY: 'k' }))).status).toBe(403)
    const limited = await worker.fetch(post(), env({ ANTHROPIC_API_KEY: 'k', CONTRARY_LIMITER: { limit: async () => ({ success: false }) } }))
    expect(limited.status).toBe(429)
  })
})
