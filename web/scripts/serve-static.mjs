// Serves the static export exactly as GitHub Pages would: under BASE_PATH,
// directory URLs resolve to index.html, unknown paths get 404.html.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'out')
const base = (process.env.BASE_PATH ?? '').replace(/\/+$/, '')
const port = Number(process.env.PORT ?? 4173)
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  let path = decodeURIComponent(url.pathname)
  if (base && !path.startsWith(base)) {
    res.writeHead(404).end('Not found')
    return
  }
  path = path.slice(base.length) || '/'
  let file = normalize(join(root, path))
  if (!file.startsWith(root)) {
    res.writeHead(403).end()
    return
  }
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!path.endsWith('/')) {
      res.writeHead(301, { Location: `${base}${path}/${url.search}` }).end()
      return
    }
    file = join(file, 'index.html')
  }
  if (!existsSync(file)) {
    const html = join(root, `${path}.html`)
    if (existsSync(html)) file = html
    else {
      res.writeHead(404, { 'Content-Type': types['.html'] })
      createReadStream(join(root, '404.html')).pipe(res)
      return
    }
  }
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' })
  createReadStream(file).pipe(res)
}).listen(port, () => console.log(`Serving ${root} at http://localhost:${port}${base}/`))
