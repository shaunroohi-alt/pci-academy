// Usage: node --experimental-strip-types --no-warnings scripts/migrate.ts
import pg from 'pg'
import { runMigrations } from '../lib/migrate.ts'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}
const pool = new pg.Pool({
  connectionString: url,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
})
try {
  const ran = await runMigrations(pool)
  console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'Database is up to date')
} finally {
  await pool.end()
}
