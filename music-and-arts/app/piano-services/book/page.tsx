import Link from 'next/link'
import type { Metadata } from 'next'
import { FormShell } from '@/components/FormShell'
import { BookingForm } from '@/components/forms/BookingForm'
import { listServices } from '@/lib/data'
import { formatCents } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Book a Piano Technician' }

export default async function BookPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const [{ service }, services] = await Promise.all([searchParams, listServices()])
  const initial = services.some((s) => s.slug === service) ? service : undefined
  return (
    <FormShell
      title="Book a technician visit"
      intro="Tell us what you need and where the piano is. We confirm a time by phone or email, usually within one business day."
      aside={
        <>
          <div className="card">
            <p className="eyebrow">Prices</p>
            <ul className="mt-3 space-y-2 text-sm">
              {services.map((s) => (
                <li key={s.slug} className="flex justify-between gap-3">
                  <span>{s.name}</span>
                  <span className="font-semibold text-gold-deep">{formatCents(s.price_cents, 'TBA')}</span>
                </li>
              ))}
            </ul>
            <Link href="/piano-services" className="mt-4 inline-block text-sm font-semibold text-gold-deep hover:underline">What each service includes →</Link>
          </div>
          <div className="card bg-gold-soft/50">
            <p className="text-sm text-ink-soft">
              <strong>Not sure which to pick?</strong> Choose <em>Quote Me Up</em>. A technician diagnoses the piano on site for {formatCents(3000)} and gives you a written offer.
            </p>
          </div>
        </>
      }
    >
      <BookingForm services={services} initialService={initial} />
    </FormShell>
  )
}
