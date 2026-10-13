// Runs once when the Next.js server starts: applies pending database migrations
// so a fresh deploy (e.g. on Railway) comes up with the schema in place.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.AUTO_MIGRATE === 'false' || !process.env.DATABASE_URL) return
  const { getPool } = await import('./lib/db')
  const { runMigrations } = await import('./lib/migrate')
  try {
    const ran = await runMigrations(getPool())
    if (ran.length) console.log(`[db] applied migrations: ${ran.join(', ')}`)
  } catch (err) {
    console.error('[db] migration failed', err)
  }
}
