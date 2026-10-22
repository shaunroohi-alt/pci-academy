import { describe, it, expect } from 'vitest'
import { isMellowDee, mellowDee } from '../../worker/mellow-dee'

describe('Mellow-Dee domain route', () => {
  it('isolates the instrument from other PCI routes', () => {
    for (const path of ['/mellow-dee-app', '/mellow-dee-app/', '/mellow-dee-app/plans', '/mellow-dee-app/api/download/item', '/mellow-dee-app.txt']) expect(isMellowDee(path)).toBe(true)
    for (const path of ['/', '/library/', '/api/reflect', '/mellow-dee-app-other', '/mellow-dee-appx/']) expect(isMellowDee(path)).toBe(false)
  })
  it('preserves POST bodies and Origin while removing forged identities and unrelated cookies', async () => {
    const response = await mellowDee(new Request('https://pci.academy/mellow-dee-app/api/kits?test=1', {
      method: 'POST', body: '{"name":"Test kit"}', headers: {
        origin: 'https://pci.academy', 'content-type': 'application/json',
        'oai-authenticated-user-id': 'forged-owner', 'OAI-Sites-Authorization': 'forged-bypass',
        authorization: 'Bearer unrelated', 'x-forwarded-host': 'evil.invalid',
        cookie: 'pci-private=secret; __Secure-mellow-dee-session=test-session; unrelated=secret',
      },
    }), (async (input: RequestInfo | URL) => {
      const request = input as Request
      expect(request.url).toBe('https://melowdee-mp-audio.shaunroohi95.chatgpt.site/mellow-dee-app/api/kits?test=1')
      expect(request.method).toBe('POST')
      expect(await request.text()).toBe('{"name":"Test kit"}')
      expect(request.headers.get('origin')).toBe('https://pci.academy')
      expect(request.headers.get('cookie')).toBe('__Secure-mellow-dee-session=test-session')
      for (const name of ['oai-authenticated-user-id', 'oai-sites-authorization', 'authorization', 'x-forwarded-host']) expect(request.headers.has(name)).toBe(false)
      return Response.json({ ok: true })
    }) as typeof fetch)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ ok: true })
  })
  it('keeps navigation on PCI and forwards only the instrument session cookies', async () => {
    const headers = new Headers({ location: 'https://melowdee-mp-audio.shaunroohi95.chatgpt.site/mellow-dee-app/library' })
    headers.append('set-cookie', 'platform=private; Secure; HttpOnly')
    headers.append('set-cookie', '__Secure-mellow-dee-session=opaque; Path=/mellow-dee-app; Secure; HttpOnly; SameSite=Lax')
    const response = await mellowDee(new Request('https://pci.academy/mellow-dee-app/auth/complete?code=test'), (async () => new Response(null, { status: 303, headers })) as typeof fetch)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://pci.academy/mellow-dee-app/library')
    expect(response.headers.getSetCookie()).toHaveLength(1)
    expect(response.headers.getSetCookie()[0]).toMatch(/^__Secure-mellow-dee-session=/)
  })
  it('streams download bytes with their disposition and does not turn failures into success', async () => {
    const bytes = new Uint8Array([0, 5, 16, 128, 255])
    const response = await mellowDee(new Request('https://pci.academy/mellow-dee-app/api/download/item'), (async () => new Response(bytes, { headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="kit.melowkit"' } })) as typeof fetch)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="kit.melowkit"')
    const denied = await mellowDee(new Request('https://pci.academy/mellow-dee-app/api/download/item'), (async () => new Response('Sign in', { status: 401 })) as typeof fetch)
    expect(denied.status).toBe(401)
  })
})
