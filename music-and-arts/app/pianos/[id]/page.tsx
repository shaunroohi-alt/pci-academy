import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { BuyerForm } from '@/components/forms/BuyerForm'
import { getPublicPiano } from '@/lib/data'
import { formatCents, humanize } from '@/lib/format'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  if (!UUID.test(id)) return { title: 'Piano' }
  const p = await getPublicPiano(id)
  if (!p) return { title: 'Piano' }
  return { title: p.public_title || [p.brand, p.model].filter(Boolean).join(' ') || 'Piano' }
}

export default async function PianoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const p = await getPublicPiano(id)
  if (!p) notFound()
  const title = p.public_title || [p.brand, p.model].filter(Boolean).join(' ') || 'Piano'
  const facts: Array<[string, string]> = [
    ['Type', humanize(p.piano_type)],
    ['Condition', humanize(p.condition)],
    ['Brand', p.brand || '—'],
    ['Model', p.model || '—'],
    ['Year', p.year_made || '—'],
    ['Location', p.city],
  ]
  return (
    <div className="container-x py-12 sm:py-16">
      <Link href="/pianos" className="text-sm text-muted hover:text-ink">← All pianos</Link>
      <div className="mt-4 grid gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="eyebrow text-plum">{humanize(p.piano_type)}</p>
          <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{title}</h1>
          <p className="display mt-3 text-3xl font-semibold text-gold-deep">{formatCents(p.list_price_cents)}</p>
          {p.photo_urls.length > 0 && (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {p.photo_urls.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt={title} className="h-56 w-full rounded-xl object-cover" />
              ))}
            </div>
          )}
          <p className="prose-tight mt-6 whitespace-pre-line text-ink-soft">{p.public_description || p.description}</p>
          <dl className="mt-8 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            {facts.map(([k, v]) => (
              <div key={k} className="rounded-xl border border-line bg-paper p-3">
                <dt className="text-xs uppercase tracking-wide text-muted">{k}</dt>
                <dd className="mt-1 font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-xs text-muted">Price includes a technician inspection and tuning on delivery. Delivery is quoted separately by distance.</p>
        </div>
        <div className="card h-fit lg:sticky lg:top-24">
          <h2 className="text-xl font-semibold">Interested in this piano?</h2>
          <p className="mt-2 text-sm text-muted">Leave your details and we will arrange a viewing or answer your questions.</p>
          <div className="mt-5">
            <BuyerForm listingId={p.id} listingTitle={title} />
          </div>
        </div>
      </div>
    </div>
  )
}
