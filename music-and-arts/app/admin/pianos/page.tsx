import Link from 'next/link'
import { Contact } from '@/components/admin/Contact'
import { Filter } from '@/components/admin/Filter'
import { StatusBadge } from '@/components/StatusBadge'
import { requireAdmin } from '@/lib/admin-auth'
import { listListings } from '@/lib/data'
import { formatCents, formatDateTime, humanize } from '@/lib/format'
import { LISTING_STATUSES } from '@/lib/options'

export const dynamic = 'force-dynamic'

export default async function AdminPianosPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin()
  const { status } = await searchParams
  const valid = LISTING_STATUSES.includes(status as never) ? status : undefined
  const rows = await listListings(valid)
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Piano listings</h1>
          <p className="mt-1 text-sm text-muted">Pianos people want to sell us. Open one to price it, publish it, and match it with a buyer.</p>
        </div>
        <Filter base="/admin/pianos" current={valid} statuses={LISTING_STATUSES} />
      </div>
      <div className="table-wrap mt-6">
        <table className="table">
          <thead><tr><th>Ref</th><th>Piano</th><th>Seller</th><th>Asking</th><th>Buy / List</th><th>Interest</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="text-center text-muted">No listings.</td></tr>}
            {rows.map((l) => (
              <tr key={l.id}>
                <td><Link href={`/admin/pianos/${l.id}`} className="font-mono text-xs text-gold-deep hover:underline">{l.ref}</Link><p className="mt-1 text-xs text-muted">{formatDateTime(l.created_at)}</p></td>
                <td><Link href={`/admin/pianos/${l.id}`} className="font-medium hover:underline">{l.public_title || [l.brand, l.model].filter(Boolean).join(' ') || humanize(l.piano_type)}</Link><p className="text-xs text-muted">{humanize(l.piano_type)} · {humanize(l.condition)}{l.year_made && ` · ${l.year_made}`}</p></td>
                <td><Contact name={l.seller_name} email={l.email} phone={l.phone} extra={l.city} /></td>
                <td className="text-sm">{formatCents(l.asking_price_cents, 'Make offer')}</td>
                <td className="text-sm">{formatCents(l.buy_price_cents, '—')} / <strong>{formatCents(l.list_price_cents, '—')}</strong></td>
                <td className="text-sm">{l.interest_count ?? 0} buyer{l.interest_count === 1 ? '' : 's'}</td>
                <td><StatusBadge status={l.status} /><br /><Link href={`/admin/pianos/${l.id}`} className="btn-outline btn-sm mt-2">Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
