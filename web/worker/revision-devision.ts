const UPSTREAM = 'https://mp-audio-review-room-csdeqs.v2.appdeploy.ai'
const PREFIX = '/revision-devision'

export function isRevisionDevision(path: string) {
  return path === PREFIX || path === PREFIX + '.html' || path === PREFIX + '.txt' || path.startsWith(PREFIX + '/')
}

/** Mount the existing app under PCI. AppDeploy's SDK keeps its own authenticated
 * API transport; this route serves public UI assets only, without PCI cookies. */
export async function revisionDevision(request: Request, fetchOrigin: typeof fetch = fetch): Promise<Response> {
  const incoming = new URL(request.url)
  if (!isRevisionDevision(incoming.pathname)) return new Response('Not found', { status: 404 })
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
  if ([PREFIX, PREFIX + '.html', PREFIX + '.txt'].includes(incoming.pathname)) {
    return Response.redirect(incoming.origin + PREFIX + '/' + incoming.search, 307)
  }
  const path = incoming.pathname.slice(PREFIX.length)
  const upstream = new URL(UPSTREAM)
  upstream.pathname = path
  upstream.search = incoming.search
  const headers = new Headers()
  for (const name of ['accept', 'accept-language', 'range', 'if-range']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  const response = await fetchOrigin(new Request(upstream, { method: request.method, headers, redirect: 'manual' }))
  const output = new Headers(response.headers)
  output.delete('set-cookie')
  output.set('cache-control', 'private, no-store')
  output.set('x-content-type-options', 'nosniff')
  output.set('x-revision-devision-route', 'active')
  const location = output.get('location')
  if (location) {
    const target = new URL(location, upstream)
    if (target.origin === UPSTREAM) output.set('location', incoming.origin + PREFIX + target.pathname + target.search + target.hash)
  }
  if (request.method === 'GET' && output.get('content-type')?.includes('text/html')) {
    const html = (await response.text()).replace(/<head([^>]*)>/i, '<head$1><base href="' + PREFIX + '/">')
    output.delete('content-length')
    output.delete('content-encoding')
    output.delete('etag')
    return new Response(html, { status: response.status, headers: output })
  }
  return new Response(response.body, { status: response.status, headers: output })
}
