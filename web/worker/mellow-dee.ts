const UPSTREAM = 'https://melowdee-mp-audio.shaunroohi95.chatgpt.site'
const PREFIX = '/mellow-dee-app'
const COOKIE_NAMES = new Set(['__Secure-mellow-dee-session', '__Secure-mellow-dee-state'])

export function isMellowDee(path: string) {
  return path === PREFIX || path === PREFIX + '.html' || path === PREFIX + '.txt' || path.startsWith(PREFIX + '/')
}

/** Serve the instrument in PCI's namespace, including streamed private downloads.
 * This is a fixed upstream, never an open proxy. Authentication is supplied by
 * the upstream's cookie-bound Sites sign-in handoff; no service bypass is used.
 */
export async function mellowDee(request: Request, fetchOrigin: typeof fetch = fetch): Promise<Response> {
  const incoming = new URL(request.url)
  if (!isMellowDee(incoming.pathname)) return new Response('Not found', { status: 404 })
  if (incoming.pathname === PREFIX + '.txt' || incoming.pathname === PREFIX + '.html') {
    return Response.redirect(incoming.origin + PREFIX + '/' + incoming.search, 307)
  }
  const upstream = new URL(incoming.pathname + incoming.search, UPSTREAM)
  const headers = new Headers(request.headers)
  for (const name of [...headers.keys()]) {
    if (/^(?:oai-|x-oai-|x-mp-|x-mellow-|cf-access-|x-forwarded-)/i.test(name) || ['authorization', 'host', 'forwarded', 'proxy-authorization'].includes(name.toLowerCase())) headers.delete(name)
  }
  const cookies = (headers.get('cookie') ?? '').split(';').map(p => p.trim()).filter(p => COOKIE_NAMES.has(p.split('=')[0]))
  if (cookies.length) headers.set('cookie', cookies.join('; '))
  else headers.delete('cookie')
  // Keep the visitor's real Origin for the app's explicit same-origin check.
  const init = { method: request.method, headers, body: request.body, redirect: 'manual' as RequestRedirect, duplex: 'half' }
  const response = await fetchOrigin(new Request(upstream, init))
  const output = new Headers(response.headers)
  const location = output.get('location')
  if (location) {
    const target = new URL(location, upstream)
    if (target.origin === UPSTREAM && isMellowDee(target.pathname)) output.set('location', incoming.origin + target.pathname + target.search + target.hash)
  }
  // Platform login cookies belong to the auth host. Only the instrument's
  // HttpOnly, path-scoped handoff/session cookies belong on PCI Academy.
  const setCookies = response.headers.getSetCookie()
  output.delete('set-cookie')
  for (const value of setCookies) if (COOKIE_NAMES.has(value.split('=')[0])) output.append('set-cookie', value)
  if (!/\/(?:assets|_next\/static)\//.test(upstream.pathname) || setCookies.length) output.set('cache-control', 'private, no-store')
  output.set('x-content-type-options', 'nosniff')
  output.set('x-mellow-dee-route', 'active')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: output })
}
