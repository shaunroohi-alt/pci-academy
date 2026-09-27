// Apply the Supabase migrations to a throwaway Postgres (PGlite) twice, to
// prove they apply cleanly and repeat cleanly. For a real project use:
//   supabase link --project-ref <ref> && supabase db push
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'supabase', 'migrations')
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
const db = new PGlite({ extensions: { vector } })
await db.exec(readFileSync(join(root, 'tests', 'sql', 'supabase-shim.sql'), 'utf8'))
for (const pass of [1, 2]) {
  for (const f of files) {
    try {
      await db.exec(readFileSync(join(dir, f), 'utf8'))
    } catch (e) {
      console.error(`pass ${pass}: ${f} FAILED: ${e.message}${e.where ? `\n  where: ${e.where}` : ''}`)
      process.exit(1)
    }
    console.log(`pass ${pass}: ${f} ok`)
  }
}
const { rows } = await db.query(`select count(*)::int as n from pg_tables where schemaname = 'public'`)
console.log(`${rows[0].n} public tables. Migrations apply and repeat cleanly.`)
