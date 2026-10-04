import Link from 'next/link'
import type { Metadata } from 'next'
import { PageHero } from '@/components/PageHero'
import { BuyerForm } from '@/components/forms/BuyerForm'
import { listPublicPianos } from '@/lib/data'
import { formatCents, humanize } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Pianos for Sale',
  description: 'Technician-checked pianos for sale, and a waiting list for the piano you want.',
}

export default async function PianosPage() {
  const pianos = await listPublicPianos()
  return (
    <>
      <PageHero
        eyebrow="Piano marketplace"
        title="Pianos for sale"
        lead="Every instrument here came to us through a seller, was inspected by our technician, and is priced to include that service. Don't see what you want? Register your interest below."
        actions={<Link href="#wanted" className="btn-gold">Tell us what you&apos;re looking for</Link>}
        tone="plum"
      />

      <section className="container-x py-16">
        {pianos.length === 0 ? (
          <div className="card text-center">
            <h2 className="text-2xl font-semibold">Nothing listed right now</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted">
              Pianos come and go quickly. Leave your details below and you will be the first to hear when a matching instrument arrives.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {pianos.map((p) => {
              const title = p.public_title || [p.brand, p.model].filter(Boolean).join(' ') || 'Piano'
              return (
                <Link key={p.id} href={`/pianos/${p.id}`} className="card flex flex-col overflow-hidden p-0 transition hover:-translate-y-0.5 hover:shadow-lg">
                  {p.photo_urls[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photo_urls[0]} alt={title} className="h-48 w-full object-cover" />
                  ) : (
                    <div className="flex h-48 items-center justify-center bg-plum-soft text-5xl text-plum">♩</div>
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-plum">{humanize(p.piano_type)} · {humanize(p.condition)}</p>
                    <h2 className="mt-1 text-lg font-semibold">{title}</h2>
                    <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted">{p.public_description || p.description}</p>
                    <p className="display mt-4 text-xl font-semibold">{formatCents(p.list_price_cents)}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      <section id="wanted" className="scroll-mt-24 bg-plum-soft/50">
        <div className="container-x grid gap-10 py-16 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="eyebrow text-plum">Piano wanted</p>
            <h2 className="mt-2 text-3xl font-semibold">Join the buyers&apos; list</h2>
            <p className="mt-4 text-ink-soft">
              Tell us the type of piano, your budget and your timeline. We match incoming instruments against this list before they go public,
              and our technician checks every piano before it changes hands.
            </p>
          </div>
          <div className="card">
            <BuyerForm />
          </div>
        </div>
      </section>
    </>
  )
}
