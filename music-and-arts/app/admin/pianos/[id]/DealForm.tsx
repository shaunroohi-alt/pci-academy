'use client'

import { useState } from 'react'
import { makeDeal } from '@/app/admin/actions'
import { SubmitButton } from '@/components/SubmitButton'
import type { BuyerInterest, Listing } from '@/lib/data'
import { applyMarkup, centsToDollarsInput, formatCents } from '@/lib/format'

export function DealForm({ listing, markupPercent, buyers }: { listing: Listing; markupPercent: number; buyers: BuyerInterest[] }) {
  const [buy, setBuy] = useState(centsToDollarsInput(listing.buy_price_cents))
  const [markup, setMarkup] = useState(String(markupPercent))
  const buyCents = Math.round(Number(buy || 0) * 100)
  const markupNum = Number(markup)
  const suggested = buyCents > 0 && Number.isFinite(markupNum) ? applyMarkup(buyCents, markupNum) : null
  const seen = new Set<string>()
  const options = buyers.filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)))
  return (
    <form action={makeDeal} className="mt-4 grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="listing_id" value={listing.id} />
      <div>
        <label htmlFor="buyer_id" className="label">Buyer</label>
        <select id="buyer_id" name="buyer_id" className="input" defaultValue="">
          <option value="">No buyer yet</option>
          {options.map((b) => <option key={b.id} value={b.id}>{b.buyer_name} ({b.ref})</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="deal_buy_price" className="label">Buy price (USD)</label>
        <input id="deal_buy_price" name="buy_price" inputMode="decimal" value={buy} onChange={(e) => setBuy(e.target.value)} className="input" required />
      </div>
      <div>
        <label htmlFor="deal_markup" className="label">Markup %</label>
        <input id="deal_markup" name="markup_percent" inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} className="input" required />
      </div>
      <div>
        <label htmlFor="deal_sale_price" className="label">Sale price (USD)</label>
        <input id="deal_sale_price" name="sale_price" inputMode="decimal" className="input" placeholder={suggested != null ? `Blank = ${formatCents(suggested)}` : 'Blank = buy price + markup'} />
        <p className="help">{suggested != null ? `Suggested: ${formatCents(suggested)} (rounded up to the nearest $5)` : 'Enter a buy price to see the suggestion.'}</p>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="deal_notes" className="label">Notes</label>
        <textarea id="deal_notes" name="notes" rows={2} className="input" placeholder="Delivery, payment terms, tuning on delivery…" />
      </div>
      <div className="sm:col-span-2"><SubmitButton pendingText="Creating…">Create deal</SubmitButton></div>
    </form>
  )
}
