import { Pool, type QueryResultRow } from 'pg'

declare global {
  var __maaPool: Pool | undefined
}

function createPool() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  return new Pool({
    connectionString,
    max: 5,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  })
}

export function getPool(): Pool {
  if (!globalThis.__maaPool) globalThis.__maaPool = createPool()
  return globalThis.__maaPool
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const res = await getPool().query<T>(text, params)
  return res.rows
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const rows = await query<T>(text, params)
  return rows[0] ?? null
}
