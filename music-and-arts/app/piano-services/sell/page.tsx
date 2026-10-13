import type { Metadata } from 'next'
import { FormShell } from '@/components/FormShell'
import { SellForm } from '@/components/forms/SellForm'

export const metadata: Metadata = { title: 'Sell Us Your Piano' }

export default function SellPage() {
  return (
    <FormShell
      title="Sell us your piano"
      intro="Give us the details and we come back with an offer or a request to see it. There is no obligation and no fee to ask."
      aside={
        <>
          <div className="card">
            <p className="eyebrow">What happens next</p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-soft">
              <li>We review your submission and photos.</li>
              <li>We may suggest a Quote Me Up visit to inspect it.</li>
              <li>You receive an offer. If you accept, we arrange collection.</li>
            </ol>
          </div>
          <div className="card">
            <p className="eyebrow">What we look for</p>
            <p className="mt-3 text-sm text-ink-soft">Brand, age, condition of the soundboard, pinblock and action, and whether it holds a tuning. Even pianos that need work can have value.</p>
          </div>
        </>
      }
    >
      <SellForm />
    </FormShell>
  )
}
