import { describe, it, expect } from 'vitest'
import { isMpAudio, mpAudio } from '../../worker/mp-audio'

describe('MP Audio domain route', () => {
  it('isolates the store from other PCI routes', () => {
    for (const path of ['/mp-audio', '/mp-audio/', '/mp-audio/plans', '/mp-audio/api/download/item', '/mp-audio.txt']) expect(isMpAudio(path)).toBe(true)
    for (const path of ['/', '/library/', '/api/reflect', '/mp-audio-other', '/mp-audiox/']) expect(isMpAudio(path)).toBe(false)
  })
  it('preserves POST bodies and Origin while removing forged identities and unrelated cookies', async () => {
    const response = await mpAudio(new Request('https://pci.academy/mp-audio/api/checkout?test=1', {
      method: 'POST', body: '{"kind":"pick5"}', headers: {
        origin: 'https://pci.academy', 'content-type': 'application/json',
        'oai-authenticated-user-id': 'forged-owner', 'OAI-Sites-Authorization': 'forged-bypass',
        authorization: 'Bearer unrelated', 'x-forwarded-host': 'evil.invalid',
        cookie: 'pci-private=secret; __Secure-mp-audio-session=test-session; unrelated=secret',
      },
    }), (async (input: RequestInfo | URL) => {
      const request = input as Request
      expect(request.url).toBe('https://mp-audio.shaunroohi95.chatgpt.site/mp-audio/api/checkout?test=1')
      expect(request.method).toBe('POST')
      expect(await request.text()).toBe('{"kind":"pick5"}')
      expect(request.headers.get('origin')).toBe('https://pci.academy')
      expect(request.headers.get('cookie')).toBe('__Secure-mp-audio-session=test-session')
      for (const name of ['oai-authenticated-user-id', 'oai-sites-authorization', 'authorization', 'x-forwarded-host']) expect(request.headers.has(name)).toBe(false)
      return Response.json({ ok: true })
    }) as typeof fetch)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ ok: true })
  })
  it('keeps navigation on PCI and forwards only the store session cookies', async () => {
    const headers = new Headers({ location: 'https://mp-audio.shaunroohi95.chatgpt.site/mp-audio/library' })
    headers.append('set-cookie', 'platform=private; Secure; HttpOnly')
    headers.append('set-cookie', '__Secure-mp-audio-session=opaque; Path=/mp-audio; Secure; HttpOnly; SameSite=Lax')
    const response = await mpAudio(new Request('https://pci.academy/mp-audio/auth/complete?code=test'), (async () => new Response(null, { status: 303, headers })) as typeof fetch)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://pci.academy/mp-audio/library')
    expect(response.headers.getSetCookie()).toHaveLength(1)
    expect(response.headers.getSetCookie()[0]).toMatch(/^__Secure-mp-audio-session=/)
  })
  it('streams download bytes with their disposition and does not turn failures into success', async () => {
    const bytes = new Uint8Array([0, 5, 16, 128, 255])
    const response = await mpAudio(new Request('https://pci.academy/mp-audio/api/download/item'), (async () => new Response(bytes, { headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="item.dmg"' } })) as typeof fetch)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="item.dmg"')
    const denied = await mpAudio(new Request('https://pci.academy/mp-audio/api/download/item'), (async () => new Response('Sign in', { status: 401 })) as typeof fetch)
    expect(denied.status).toBe(401)
  })
})
