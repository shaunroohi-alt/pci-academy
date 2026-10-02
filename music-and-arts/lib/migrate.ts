import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Pool } from 'pg'

const LOCK_KEY = 7_430_921

/** Applies every db/migrations/*.sql file that has not been applied yet, in name order. */
export async function runMigrations(pool: Pool, dir = join(process.cwd(), 'db', 'migrations')) {
  const client = await pool.connect()
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK_KEY])
    await client.query(
      'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
    )
    const applied = new Set(
      (await client.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name),
    )
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
    const ran: string[] = []
    for (const file of files) {
      if (applied.has(file)) continue
      const sql = readFileSync(join(dir, file), 'utf8')
      await client.query('begin')
      try {
        await client.query(sql)
        await client.query('insert into schema_migrations (name) values ($1)', [file])
        await client.query('commit')
      } catch (err) {
        await client.query('rollback')
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`)
      }
      ran.push(file)
    }
    return ran
  } finally {
    await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {})
    client.release()
  }
}
