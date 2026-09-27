// Injects the precache list and a build id into out/sw.js after `next build`.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'out')

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

const files = walk(out)
  .map((p) => '/' + relative(out, p).split('\\').join('/'))
  .filter((p) => p !== '/sw.js' && !p.endsWith('.txt') && !p.endsWith('.map') && !p.startsWith('/icons/maskable') && p !== '/404.html')
  // Pages are cached by directory URL; everything else by file path.
  .map((p) => (p.endsWith('/index.html') ? p.slice(0, -'index.html'.length) : p))
  .sort()

const hash = createHash('sha256')
for (const f of files) hash.update(f)
for (const p of walk(join(out, '_next'))) hash.update(readFileSync(p))
const buildId = hash.digest('hex').slice(0, 12)

const swPath = join(out, 'sw.js')
const sw = readFileSync(swPath, 'utf8').replace('/*__PRECACHE__*/ []', JSON.stringify(files)).replace('__BUILD_ID__', buildId)
writeFileSync(swPath, sw)
console.log(`service worker: ${files.length} files precached, build ${buildId}`)
