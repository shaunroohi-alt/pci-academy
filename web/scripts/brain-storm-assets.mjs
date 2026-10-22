// The sampler has its own lifecycle. In particular, its 84 MB stem model must
// never become part of every PCI visitor's application-shell download.
export function shouldPciPrecache(path) {
  return path !== '/brain-storm' && !path.startsWith('/brain-storm/') && path !== '/brain-storm.html'
}

export function brainStormWorkerSource(version, shellFiles, modelHash) {
  return `/* Brain Storm: its own scoped shell and lazily requested audio tools. */
const VERSION = ${JSON.stringify(version)}
const MODEL_HASH = ${JSON.stringify(modelHash)}
const SHELL_FILES = ${JSON.stringify(shellFiles)}
const BASE = new URL(self.registration.scope).pathname
const SHELL_CACHE = 'brain-storm-shell-' + VERSION
const MODEL_CACHE = 'brain-storm-model-' + MODEL_HASH

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE)
    for (const file of SHELL_FILES) {
      const canonical = new URL(file, self.registration.scope)
      const fresh = new URL(canonical)
      // Bypass an older parent PCI worker's cached empty placeholder.
      fresh.searchParams.set('__brainstorm_build', VERSION)
      const response = await fetch(fresh, { cache: 'reload' })
      if (!response.ok) throw new Error('Could not cache the Brain Storm shell')
      await cache.put(canonical, response)
    }
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key.startsWith('brain-storm-') && key !== SHELL_CACHE && key !== MODEL_CACHE).map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE) || request.headers.has('range')) return
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE)
      try {
        const response = await fetch(request)
        if (response.ok) event.waitUntil(cache.put(new URL('index.html', self.registration.scope), response.clone()).catch(() => {}))
        return response
      } catch {
        return (await cache.match(new URL('index.html', self.registration.scope))) || Response.error()
      }
    })())
    return
  }
  // Neither the model nor the WASM engine is fetched by install. Model chunks
  // enter a hash-versioned cache only after the user requests stem separation.
  const isModel = url.pathname.startsWith(BASE + 'models/') && url.pathname.endsWith('.bin')
  event.respondWith((async () => {
    const cache = await caches.open(isModel ? MODEL_CACHE : SHELL_CACHE)
    const hit = await cache.match(request)
    if (hit) return hit
    const response = await fetch(request)
    if (response.status === 200) event.waitUntil(cache.put(request, response.clone()).catch(() => {}))
    return response
  })())
})
`
}
