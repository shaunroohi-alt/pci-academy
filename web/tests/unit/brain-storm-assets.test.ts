import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createContext, runInContext } from 'node:vm'
import { brainStormWorkerSource, shouldPciPrecache } from '../../scripts/brain-storm-assets.mjs'

type Input = string | URL | { url: string }
type FetchEvent = {
  request: { url: string; method: string; mode: string; headers: Headers }
  respondWith(value: Promise<Response>): void
  waitUntil(value: Promise<unknown>): void
}
const keyOf = (input: Input) => typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

function worker(source: string, scope: string, network?: (input: Input) => Promise<Response>) {
  const handlers = new Map<string, (event: FetchEvent) => void>()
  const stores = new Map<string, Map<string, Response>>()
  const fetched: string[] = []
  let served: Response | undefined
  const context = createContext({
    URL, Response,
    self: {
      registration: { scope }, location: { origin: new URL(scope).origin },
      addEventListener: (name: string, handler: (event: FetchEvent) => void) => handlers.set(name, handler),
      skipWaiting: async () => {}, clients: { claim: async () => {} },
    },
    caches: {
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      match: async () => undefined,
      open: async (name: string) => {
        if (!stores.has(name)) stores.set(name, new Map())
        const store = stores.get(name)!
        return {
          put: async (input: Input, response: Response) => { store.set(keyOf(input), response.clone()) },
          match: async (input: Input) => store.get(keyOf(input))?.clone(),
        }
      },
    },
    fetch: async (input: Input) => { fetched.push(keyOf(input)); return network ? network(input) : new Response('verified asset') },
  })
  runInContext(source, context)
  const dispatch = async (name: string, path = scope, mode = 'cors') => {
    const pending: Promise<unknown>[] = []
    let response: Promise<Response> | undefined
    handlers.get(name)?.({
      request: { url: path, method: 'GET', mode, headers: new Headers() },
      respondWith(value) { response = value }, waitUntil(value) { pending.push(value) },
    })
    served = response ? await response : undefined
    await Promise.all(pending)
    return response !== undefined
  }
  return { stores, fetched, dispatch, get response() { return served } }
}

describe('Brain Storm asset lifecycle', () => {
  it('excludes the complete sampler from the PCI-wide application precache', () => {
    for (const path of ['/brain-storm', '/brain-storm/', '/brain-storm/index.html', '/brain-storm/assets/main.js', '/brain-storm/models/htdemucs-4s-f16.part-00.bin', '/brain-storm.html']) expect(shouldPciPrecache(path)).toBe(false)
    for (const path of ['/today/', '/library/book/', '/_next/static/main.js', '/brain-storm-other/']) expect(shouldPciPrecache(path)).toBe(true)
  })

  it('the actual PCI worker leaves sampler pages and large model requests to the scoped worker', async () => {
    const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8')
    for (const base of ['/', '/pci-academy/']) {
      const app = worker(source, `https://pci.academy${base}`)
      for (const suffix of ['brain-storm', 'brain-storm/', 'brain-storm/assets/main.js', 'brain-storm/models/htdemucs-4s-f16.part-00.bin']) expect(await app.dispatch('fetch', `https://pci.academy${base}${suffix}`)).toBe(false)
      expect(app.fetched).toEqual([])
    }
  })

  it('installs only the sampler shell and caches model bytes only after a real request', async () => {
    const scope = 'https://pci.academy/pci-academy/brain-storm/'
    const app = worker(brainStormWorkerSource('build-a', ['index.html', 'assets/main.js', 'assets/pitch-worklet.js'], 'model-sha'), scope)
    await app.dispatch('install')
    expect(app.fetched).toHaveLength(3)
    expect(app.fetched.every((url) => url.startsWith(scope) && url.includes('__brainstorm_build=build-a'))).toBe(true)
    expect(app.fetched.some((url) => /\/(?:models|stems)\//.test(url))).toBe(false)
    expect([...app.stores.keys()]).toEqual(['brain-storm-shell-build-a'])
    expect(app.stores.get('brain-storm-shell-build-a')?.has(scope + 'index.html')).toBe(true)

    const model = scope + 'models/htdemucs-4s-f16.part-00.bin'
    expect(await app.dispatch('fetch', model)).toBe(true)
    expect(app.stores.get('brain-storm-model-model-sha')?.has(model)).toBe(true)
    expect(app.fetched.filter((url) => url === model)).toHaveLength(1)
    expect(await app.dispatch('fetch', model)).toBe(true)
    expect(app.fetched.filter((url) => url === model)).toHaveLength(1)
    expect(await app.dispatch('fetch', 'https://pci.academy/api/contrary')).toBe(false)
  })

  it('purges only its own old caches while retaining the verified model between UI releases', async () => {
    const app = worker(brainStormWorkerSource('new-build', [], 'same-model'), 'https://pci.academy/brain-storm/')
    app.stores.set('pci-current', new Map())
    app.stores.set('brain-storm-shell-old-build', new Map())
    app.stores.set('brain-storm-shell-new-build', new Map())
    app.stores.set('brain-storm-model-same-model', new Map())
    app.stores.set('brain-storm-model-old-model', new Map())
    await app.dispatch('activate')
    expect([...app.stores.keys()].sort()).toEqual(['brain-storm-model-same-model', 'brain-storm-shell-new-build', 'pci-current'])
  })

  it('serves offline navigation after a clean-URL host redirects the cached HTML', async () => {
    const html = '<!doctype html><title>Brain Storm offline</title>'
    const server = createServer((request, response) => {
      if (request.url?.startsWith('/brain-storm/index.html')) {
        response.writeHead(302, { location: '/brain-storm/' }).end()
      } else {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-shell': 'verified' }).end(html)
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const scope = `http://127.0.0.1:${(server.address() as AddressInfo).port}/brain-storm/`
      const redirected = await fetch(scope + 'index.html')
      expect(redirected.redirected).toBe(true)
      let offline = false
      const app = worker(brainStormWorkerSource('redirect-build', ['index.html'], 'model'), scope, async () => {
        if (offline) throw new TypeError('Network unavailable')
        return redirected.clone()
      })
      const key = scope + 'index.html'
      await app.dispatch('install')
      const shell = app.stores.get('brain-storm-shell-redirect-build')!
      expect(shell.get(key)?.redirected).toBe(false)

      // A later online navigation must not reintroduce redirect history.
      await app.dispatch('fetch', key, 'navigate')
      expect(shell.get(key)?.redirected).toBe(false)
      offline = true
      await app.dispatch('fetch', scope, 'navigate')
      expect(app.response?.redirected).toBe(false)
      expect(app.response?.status).toBe(200)
      expect(app.response?.headers.get('x-shell')).toBe('verified')
      expect(await app.response?.text()).toBe(html)

      // Also recover an existing cache written by the previous worker version.
      shell.set(key, redirected.clone())
      await app.dispatch('fetch', scope, 'navigate')
      expect(app.response?.redirected).toBe(false)
      expect(await app.response?.text()).toBe(html)
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })
})
