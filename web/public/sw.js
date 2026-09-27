/* PCI Academy service worker (§9.2).
 * Precaches the application shell, the corpus and every page at build time,
 * so the Reader, Glossary, Journal and Ledger work offline. The user's own
 * material lives in IndexedDB and never passes through this cache.
 * Requests to other origins (Supabase, AI) are never cached. */
const VERSION = '__BUILD_ID__'
const PRECACHE = /*__PRECACHE__*/ []
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, '')
const CACHE = `pci-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((p) => BASE + p)))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pci-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    // Network first for pages, so a deploy is picked up; the cached page
    // (ignoring ?query) when offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(url.pathname, copy))
          return res
        })
        .catch(async () => {
          const cache = await caches.open(CACHE)
          const path = url.pathname.endsWith('/') ? url.pathname : url.pathname + '/'
          return (await cache.match(path)) || (await cache.match(path + 'index.html')) || (await cache.match(BASE + '/offline/')) || Response.error()
        }),
    )
    return
  }

  // Static assets: cache first (they are content-hashed).
  event.respondWith(
    caches.match(req, { ignoreSearch: url.pathname.includes('/_next/static/') }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.includes('/_next/') || /\.(?:woff2|png|svg|webmanifest)$/.test(url.pathname))) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
