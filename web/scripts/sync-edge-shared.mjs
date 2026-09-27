// Copies the PCI engine modules (lib/pci) into the Edge Function's shared
// folder, so the server validates with exactly the canon the app uses.
//   pnpm edge:sync    write the copies
//   pnpm edge:check   fail if the copies are out of date (CI)
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'lib', 'pci')
const dest = join(root, 'supabase', 'functions', '_shared', 'pci')
const HEADER = '// GENERATED from web/lib/pci by scripts/sync-edge-shared.mjs — do not edit here.\n'
const check = process.argv.includes('--check')

const files = readdirSync(src).filter((f) => f.endsWith('.ts'))
let stale = []
if (!check) {
  if (existsSync(dest)) rmSync(dest, { recursive: true })
  mkdirSync(dest, { recursive: true })
}
for (const f of files) {
  const content = HEADER + readFileSync(join(src, f), 'utf8')
  const target = join(dest, f)
  if (check) {
    if (!existsSync(target) || readFileSync(target, 'utf8') !== content) stale.push(f)
  } else writeFileSync(target, content)
}
if (check) {
  const extra = existsSync(dest) ? readdirSync(dest).filter((f) => !files.includes(f)) : []
  stale = [...stale, ...extra]
  if (stale.length) {
    console.error(`Edge Function copies are out of date: ${stale.join(', ')}. Run pnpm edge:sync.`)
    process.exit(1)
  }
  console.log(`Edge Function shared engine is in sync (${files.length} files).`)
} else console.log(`Synced ${files.length} files to supabase/functions/_shared/pci.`)
