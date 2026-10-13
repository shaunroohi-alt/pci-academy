import Link from 'next/link'
import { StatusForm } from '@/components/admin/StatusForm'
import { StatusBadge } from '@/components/StatusBadge'
import { requireAdmin } from '@/lib/admin-auth'
import { listDeals } from '@/lib/data'
import { formatCents, formatDateTime } from '@/lib/format'
import { DEAL_STATUSES } from '@/lib/options'

export const dynamic = 'force-dynamic'

export default async function DealsPage() {
  await requireAdmin()
  const rows = await listDeals()
  const margin = rows.filter((d) => ['agreed', 'paid', 'delivered'].includes(d.status)).reduce((sum, d) => sum + (d.sale_price_cents - d.buy_price_cents), 0)
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Deals</h1>
          <p className="mt-1 text-sm text-muted">Each deal links a piano we bought to the buyer and records the margin.</p>
        </div>
        <div className="card py-3"><p className="text-xs text-muted">Margin on agreed or completed deals</p><p className="display text-2xl font-semibold">{formatCents(margin)}</p></div>
      </div>
      <div className="table-wrap mt-6">
        <table className="table">
          <thead><tr><th>Created</th><th>Piano</th><th>Buyer</th><th>Buy</th><th>Markup</th><th>Sale</th><th>Margin</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="text-center text-muted">No deals yet. Open a listing to create one.</td></tr>}
            {rows.map((d) => (
              <tr key={d.id}>
                <td className="text-xs text-muted">{formatDateTime(d.created_at)}</td>
                <td><Link href={`/admin/pianos/${d.listing_id}`} className="font-medium text-gold-deep hover:underline">{d.listing_title}</Link></td>
                <td className="text-sm">{d.buyer_name ?? <span className="text-muted">Unassigned</span>}</td>
                <td className="text-sm">{formatCents(d.buy_price_cents)}</td>
                <td className="text-sm">{Number(d.markup_percent)}%</td>
                <td className="text-sm font-semibold">{formatCents(d.sale_price_cents)}</td>
                <td className="text-sm">{formatCents(d.sale_price_cents - d.buy_price_cents)}</td>
                <td><StatusBadge status={d.status} /><div className="mt-2"><StatusForm table="deals" id={d.id} status={d.status} statuses={DEAL_STATUSES} withNotes={false} /></div>{d.notes && <p className="mt-2 max-w-[200px] text-xs text-muted">{d.notes}</p>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
