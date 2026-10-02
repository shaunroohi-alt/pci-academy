import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await queryOne('select 1 as ok')
    return NextResponse.json({ ok: true, db: 'up' })
  } catch (err) {
    return NextResponse.json({ ok: false, db: 'down', error: (err as Error).message }, { status: 503 })
  }
}
