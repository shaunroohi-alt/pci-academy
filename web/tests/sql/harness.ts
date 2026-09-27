import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..')

export function migrationFiles(): string[] {
  const dir = join(root, 'supabase', 'migrations')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(dir, f))
}

export async function freshDatabase(): Promise<PGlite> {
  const db = new PGlite({ extensions: { vector } })
  await db.exec(readFileSync(join(__dirname, 'supabase-shim.sql'), 'utf8'))
  return db
}

export async function migrate(db: PGlite) {
  for (const f of migrationFiles()) await db.exec(readFileSync(f, 'utf8'))
}

/** Run `fn` as an authenticated user, with RLS in force. */
export async function asUser<T>(db: PGlite, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${userId ? 'authenticated' : 'anon'}`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? ''])
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
  }
}
