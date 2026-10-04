import Link from 'next/link'
import { Contact } from '@/components/admin/Contact'
import { Filter } from '@/components/admin/Filter'
import { StatusForm } from '@/components/admin/StatusForm'
import { StatusBadge } from '@/components/StatusBadge'
import { requireAdmin } from '@/lib/admin-auth'
import { listBuyers } from '@/lib/data'
import { formatCents, formatDateTime, humanize } from '@/lib/format'
import { BUYER_STATUSES } from '@/lib/options'

export const dynamic = 'force-dynamic'

export default async function BuyersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin()
  const { status } = await searchParams
  const valid = BUYER_STATUSES.includes(status as never) ? status : undefined
  const rows = await listBuyers(valid)
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Buyers</h1>
          <p className="mt-1 text-sm text-muted">People who want a piano: either a specific listing or anything that matches their brief.</p>
        </div>
        <Filter base="/admin/buyers" current={valid} statuses={BUYER_STATUSES} />
      </div>
      <div className="table-wrap mt-6">
        <table className="table">
          <thead><tr><th>Ref</th><th>Buyer</th><th>Wants</th><th>Budget</th><th>Timeline</th><th>Notes</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="text-center text-muted">No buyers.</td></tr>}
            {rows.map((b) => (
              <tr key={b.id}>
                <td><code className="text-xs">{b.ref}</code><p className="mt-1 text-xs text-muted">{formatDateTime(b.created_at)}</p></td>
                <td><Contact name={b.buyer_name} email={b.email} phone={b.phone} extra={b.city} /></td>
                <td className="text-sm">{b.listing_id ? <Link href={`/admin/pianos/${b.listing_id}`} className="text-gold-deep hover:underline">{b.listing_title || 'A listed piano'}</Link> : <>Any: {humanize(b.piano_type)}</>}</td>
                <td className="text-sm">{b.budget_min_cents == null && b.budget_max_cents == null ? '—' : `${formatCents(b.budget_min_cents, '?')} to ${formatCents(b.budget_max_cents, '?')}`}</td>
                <td className="text-sm">{humanize(b.timeline)}</td>
                <td className="max-w-[220px] whitespace-pre-line text-xs text-muted">{b.notes}</td>
                <td><StatusBadge status={b.status} /><div className="mt-2"><StatusForm table="buyer_interests" id={b.id} status={b.status} statuses={BUYER_STATUSES} notes={b.admin_notes} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
