import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Contact } from '@/components/admin/Contact'
import { StatusBadge } from '@/components/StatusBadge'
import { requireAdmin } from '@/lib/admin-auth'
import { getListing, getMarkupPercent, listBuyers, listBuyersForListing } from '@/lib/data'
import { formatCents, formatDateTime, humanize } from '@/lib/format'
import { ListingEditor } from './ListingEditor'
import { DealForm } from './DealForm'

export const dynamic = 'force-dynamic'

export default async function AdminListingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const listing = await getListing(id)
  if (!listing) notFound()
  const [markup, interested, allBuyers] = await Promise.all([getMarkupPercent(), listBuyersForListing(id), listBuyers()])
  const title = listing.public_title || [listing.brand, listing.model].filter(Boolean).join(' ') || humanize(listing.piano_type)
  // Buyers who registered general interest and might fit this piano.
  const candidates = allBuyers.filter(
    (b) => b.listing_id !== id && b.status !== 'closed' && (b.piano_type === 'any' || b.piano_type === listing.piano_type),
  )

  return (
    <>
      <Link href="/admin/pianos" className="text-sm text-muted hover:text-ink">← All listings</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold">{title}</h1>
        <StatusBadge status={listing.status} />
        <code className="text-xs text-muted">{listing.ref}</code>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className="card">
          <p className="eyebrow">Seller submission</p>
          <div className="mt-3"><Contact name={listing.seller_name} email={listing.email} phone={listing.phone} extra={listing.city} /></div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {([
              ['Type', humanize(listing.piano_type)], ['Condition', humanize(listing.condition)], ['Brand', listing.brand || '—'], ['Model', listing.model || '—'],
              ['Year', listing.year_made || '—'], ['Serial', listing.serial_number || '—'], ['Asking', formatCents(listing.asking_price_cents, 'Make offer')], ['Submitted', formatDateTime(listing.created_at)],
            ] as Array<[string, string]>).map(([k, v]) => (
              <div key={k}><dt className="text-xs uppercase tracking-wide text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>
            ))}
          </dl>
          {listing.description && <p className="mt-4 whitespace-pre-line text-sm text-ink-soft">{listing.description}</p>}
          {listing.photo_urls.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm">
              {listing.photo_urls.map((u) => <li key={u}><a href={u} target="_blank" rel="noreferrer" className="break-all text-gold-deep hover:underline">{u}</a></li>)}
            </ul>
          )}
        </section>

        <section className="card">
          <p className="eyebrow">Pricing and publishing</p>
          <p className="mt-1 text-sm text-muted">Set what we pay and what buyers see. Leave list price blank to apply the default markup of {markup}%.</p>
          <ListingEditor listing={listing} markupPercent={markup} />
        </section>
      </div>

      <section className="card mt-6">
        <p className="eyebrow">Buyers interested in this piano</p>
        {interested.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nobody has enquired about this piano yet.</p>
        ) : (
          <div className="table-wrap mt-3">
            <table className="table">
              <thead><tr><th>Ref</th><th>Buyer</th><th>Timeline</th><th>Notes</th><th>Status</th></tr></thead>
              <tbody>
                {interested.map((b) => (
                  <tr key={b.id}>
                    <td><code className="text-xs">{b.ref}</code><p className="text-xs text-muted">{formatDateTime(b.created_at)}</p></td>
                    <td><Contact name={b.buyer_name} email={b.email} phone={b.phone} extra={b.city} /></td>
                    <td className="text-sm">{humanize(b.timeline)}</td>
                    <td className="max-w-[260px] whitespace-pre-line text-xs text-muted">{b.notes}</td>
                    <td><StatusBadge status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {candidates.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-gold-deep">{candidates.length} buyer{candidates.length === 1 ? '' : 's'} on the general list may match this piano</summary>
            <ul className="mt-3 space-y-2 text-sm">
              {candidates.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-cream px-3 py-2">
                  <span><strong>{b.buyer_name}</strong> · {humanize(b.piano_type)} · {formatCents(b.budget_min_cents, '?')} to {formatCents(b.budget_max_cents, '?')} · {humanize(b.timeline)}</span>
                  <StatusBadge status={b.status} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="card mt-6">
        <p className="eyebrow">Make a deal</p>
        <p className="mt-1 text-sm text-muted">Records the buy price, the markup and the final sale price for this piano, optionally linked to a buyer.</p>
        <DealForm listing={listing} markupPercent={markup} buyers={[...interested, ...candidates]} />
      </section>
    </>
  )
}
