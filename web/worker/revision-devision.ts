const PREFIX = '/revision-devision'

export function isRevisionDevision(path: string) {
  return path === PREFIX || path === PREFIX + '.html' || path === PREFIX + '.txt' || path.startsWith(PREFIX + '/')
}

/** Keep AppDeploy's app and popup authentication on their supported origin.
 * Only the containing page is served by PCI; no credentials are proxied. */
export async function revisionDevision(request: Request): Promise<Response> {
  const incoming = new URL(request.url)
  if (!isRevisionDevision(incoming.pathname)) return new Response('Not found', { status: 404 })
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
  if ([PREFIX, PREFIX + '.html', PREFIX + '.txt'].includes(incoming.pathname)) {
    return Response.redirect(incoming.origin + PREFIX + '/' + incoming.search, 307)
  }
  if (incoming.pathname !== PREFIX + '/') return new Response('Not found', { status: 404 })
  return new Response(request.method === 'HEAD' ? null : "<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n  <title>Revision Devision By MP-AUDIO</title>\n  <meta name=\"description\" content=\"Revision Devision By MP-AUDIO — private audio previews, timestamp feedback, and version approvals.\">\n  <style>html,body{margin:0;width:100%;height:100%;background:#151815}iframe{display:block;width:100%;height:100%;border:0}a{color:#eee}</style>\n</head>\n<body>\n  <iframe title=\"Revision Devision By MP-AUDIO\" src=\"https://mp-audio-review-room-csdeqs.v2.appdeploy.ai/\" allow=\"autoplay; fullscreen; clipboard-write\" allowfullscreen></iframe>\n  <script>\n    const frame = document.querySelector('iframe');\n    const base = 'https://mp-audio-review-room-csdeqs.v2.appdeploy.ai/';\n    if (location.hash) frame.src = base + location.hash;\n    window.addEventListener('hashchange', () => { frame.src = base + location.hash; });\n  </script>\n  <noscript><a href=\"https://mp-audio-review-room-csdeqs.v2.appdeploy.ai/\">Open Revision Devision By MP-AUDIO</a></noscript>\n</body>\n</html>", {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'x-revision-devision-route': 'active',
      'referrer-policy': 'strict-origin-when-cross-origin',
    },
  })
}
