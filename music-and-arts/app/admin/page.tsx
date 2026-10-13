import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { dashboardCounts } from '@/lib/data'

export const dynamic = 'force-dynamic'

export default async function AdminHome() {
  await requireAdmin()
  const c = await dashboardCounts()
  const tiles: Array<[string, number, string, string]> = [
    ['Open appointments', c.appointments_open, '/admin/appointments', 'Requested or confirmed'],
    ['Pianos to review', c.listings_new, '/admin/pianos?status=new', 'New seller submissions'],
    ['Pianos listed', c.listings_listed, '/admin/pianos?status=listed', 'Live on the public page'],
    ['New buyers', c.buyers_new, '/admin/buyers?status=new', 'Waiting for contact'],
    ['Deals in progress', c.deals_open, '/admin/deals', 'Proposed or agreed'],
    ['New lesson enquiries', c.inquiries_new, '/admin/lessons?status=new', 'Waiting for contact'],
  ]
  return (
    <>
      <h1 className="text-3xl font-semibold">Dashboard</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(([label, n, href, sub]) => (
          <Link key={label} href={href} className="card transition hover:border-gold/60">
            <p className="text-sm text-muted">{label}</p>
            <p className="display mt-1 text-4xl font-semibold">{n}</p>
            <p className="mt-1 text-xs text-muted">{sub}</p>
          </Link>
        ))}
      </div>
    </>
  )
}
