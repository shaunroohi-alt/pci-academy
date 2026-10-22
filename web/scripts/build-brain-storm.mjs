// Build the independently bundled sampler before Next copies public/ to out/.
// Keeping its React and audio dependencies separate avoids changing PCI's UI.
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { brainStormWorkerSource } from './brain-storm-assets.mjs'

const web = join(dirname(fileURLToPath(import.meta.url)), '..')
const sampler = join(web, '..', 'brain-storm')
const output = join(sampler, 'dist')
const target = join(web, 'public', 'brain-storm')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const cache = join(web, '.cache', 'brain-storm-npm')
const pinnedModelHash = '72b17c42d308982ddb5069bc3bf48b81a5aac4cb6516e4366c0fa7cef6df0064'

function run(args) {
  const child = spawnSync(npm, args, { cwd: sampler, env: process.env, stdio: 'inherit' })
  if (child.error) throw child.error
  if (child.status !== 0) throw new Error(`Brain Storm ${args.join(' ')} failed (${child.status ?? child.signal})`)
}
function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}
if (!existsSync(join(sampler, 'package-lock.json'))) throw new Error('The locked brain-storm/ source package is missing.')
run(['ci', '--no-audit', '--no-fund', '--cache', cache])
run(['test'])
run(['run', 'build'])

const manifest = JSON.parse(readFileSync(join(output, 'models', 'manifest.json'), 'utf8'))
if (manifest.sha256 !== pinnedModelHash || !Array.isArray(manifest.parts) || !manifest.parts.length) throw new Error('Brain Storm stem model is not the verified native model.')
const aggregate = createHash('sha256')
let total = 0
for (const part of manifest.parts) {
  if (typeof part.file !== 'string' || !/^htdemucs-4s-f16\.part-\d{2}\.bin$/.test(part.file)) throw new Error('Invalid stem-model part name.')
  const bytes = readFileSync(join(output, 'models', part.file))
  if (bytes.length !== part.bytes || createHash('sha256').update(bytes).digest('hex') !== part.sha256) throw new Error(`Stem-model part failed checksum: ${part.file}`)
  aggregate.update(bytes)
  total += bytes.length
}
if (aggregate.digest('hex') !== pinnedModelHash || total !== manifest.bytes) throw new Error('Stem-model aggregate failed checksum.')

const files = walk(output).sort()
const hash = createHash('sha256')
// Cache lifecycle changes must also create a distinct shell version.
hash.update(brainStormWorkerSource.toString())
for (const path of files) {
  if (statSync(path).size > 25 * 1024 * 1024) throw new Error(`Cloudflare's asset size limit is exceeded: ${relative(output, path)}`)
  const name = relative(output, path).split('\\').join('/')
  hash.update(name)
  // The pinned model is already hashed above. Avoid reading it twice merely
  // to identify an app-shell update.
  if (!name.startsWith('models/')) hash.update(readFileSync(path))
}
const version = hash.digest('hex').slice(0, 16)
const shell = ['index.html', ...files.map((path) => relative(output, path).split('\\').join('/')).filter((path) => path.startsWith('assets/') && /\.(?:js|css|woff2|svg|png)$/.test(path))]
writeFileSync(join(output, 'sw.js'), brainStormWorkerSource(version, shell, pinnedModelHash))
writeFileSync(join(output, 'build.json'), JSON.stringify({ version, modelSha256: pinnedModelHash, modelBytes: total, modelParts: manifest.parts.length }) + '\n')

// Replace generated output only after install, tests, build and model validation
// succeed, so a failed local build cannot erase the old page.
mkdirSync(dirname(target), { recursive: true })
rmSync(target, { recursive: true, force: true })
cpSync(output, target, { recursive: true })
console.log(`Brain Storm ${version}: ${files.length + 2} assets, ${manifest.parts.length} lazy model chunks; shell precaches no model or WASM.`)
