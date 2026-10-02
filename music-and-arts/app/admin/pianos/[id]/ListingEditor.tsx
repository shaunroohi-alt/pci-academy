'use client'

import { useActionState } from 'react'
import { saveListing, type ListingState } from '@/app/admin/actions'
import { SubmitButton } from '@/components/SubmitButton'
import { centsToDollarsInput, humanize } from '@/lib/format'
import { LISTING_STATUSES } from '@/lib/options'
import type { Listing } from '@/lib/data'

export function ListingEditor({ listing, markupPercent }: { listing: Listing; markupPercent: number }) {
  const [state, action] = useActionState<ListingState, FormData>(saveListing, null)
  return (
    <form action={action} className="mt-4 space-y-4">
      <input type="hidden" name="id" value={listing.id} />
      <input type="hidden" name="markup_percent" value={markupPercent} />
      {state?.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state?.saved && <p className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">Saved.</p>}
      <div>
        <label htmlFor="status" className="label">Status</label>
        <select id="status" name="status" defaultValue={listing.status} className="input">
          {LISTING_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
        </select>
        <p className="help">Only pianos with status &quot;Listed&quot; and a list price appear on the public page.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="buy_price" className="label">Buy price (what we pay)</label>
          <input id="buy_price" name="buy_price" inputMode="decimal" defaultValue={centsToDollarsInput(listing.buy_price_cents)} className="input" placeholder="e.g. 1200" />
        </div>
        <div>
          <label htmlFor="list_price" className="label">List price (what buyers see)</label>
          <input id="list_price" name="list_price" inputMode="decimal" defaultValue={centsToDollarsInput(listing.list_price_cents)} className="input" placeholder={`Blank = buy price + ${markupPercent}%`} />
        </div>
      </div>
      <div>
        <label htmlFor="public_title" className="label">Public title</label>
        <input id="public_title" name="public_title" defaultValue={listing.public_title} className="input" placeholder={[listing.brand, listing.model].filter(Boolean).join(' ') || 'e.g. Yamaha U1 upright, 1995'} />
      </div>
      <div>
        <label htmlFor="public_description" className="label">Public description</label>
        <textarea id="public_description" name="public_description" rows={4} defaultValue={listing.public_description} className="input" placeholder="What buyers should know. Falls back to the seller's description if blank." />
      </div>
      <div>
        <label htmlFor="admin_notes" className="label">Internal notes</label>
        <textarea id="admin_notes" name="admin_notes" rows={2} defaultValue={listing.admin_notes} className="input" />
      </div>
      <SubmitButton pendingText="Saving…">Save listing</SubmitButton>
    </form>
  )
}
