import Link from 'next/link'
import type { Metadata } from 'next'
import { PageHero } from '@/components/PageHero'
import { getSetting, listServices } from '@/lib/data'
import { formatCents } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Piano Technician Services',
  description: 'Regular tuning, tuning with regulation, a full service package, or a $30 Quote Me Up diagnostic visit. We also buy pianos.',
}

export default async function PianoServicesPage() {
  const [services, serviceArea] = await Promise.all([listServices(), getSetting<string>('service_area', '')])
  const quote = services.find((s) => s.slug === 'quote-me-up')
  return (
    <>
      <PageHero
        eyebrow="Section one"
        title="Piano technician services"
        lead="From a straightforward tuning to a full regulation and voicing, every visit is done by a qualified technician in your home. Not sure what the piano needs? Start with Quote Me Up."
        actions={
          <>
            <Link href="/piano-services/book" className="btn-gold">Book an appointment</Link>
            <Link href="/piano-services/sell" className="btn bg-white/10 text-white hover:bg-white/20">Sell us your piano</Link>
          </>
        }
      />

      <section className="container-x py-16">
        <div className="grid gap-6 lg:grid-cols-2">
          {services.map((s) => (
            <article key={s.slug} id={s.slug} className={`card scroll-mt-24 ${s.slug === 'quote-me-up' ? 'border-gold bg-gold-soft/40' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold">{s.name}</h2>
                  <p className="mt-1 text-muted">{s.tagline}</p>
                </div>
                <div className="text-right">
                  <p className="display text-2xl font-semibold text-gold-deep">{formatCents(s.price_cents, 'TBA')}</p>
                  <p className="text-xs text-muted">{s.price_cents == null ? 'Price to be announced' : s.price_note}</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-ink-soft">{s.description}</p>
              <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                {s.includes.map((item) => (
                  <li key={item} className="flex gap-2"><span aria-hidden className="text-gold">✓</span>{item}</li>
                ))}
              </ul>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link href={`/piano-services/book?service=${s.slug}`} className="btn-primary btn-sm">Book {s.name}</Link>
                {s.duration_minutes && <span className="text-xs text-muted">About {s.duration_minutes} minutes</span>}
              </div>
            </article>
          ))}
        </div>
        {serviceArea && <p className="mt-6 text-sm text-muted">{serviceArea}</p>}
      </section>

      {quote && (
        <section className="bg-ink text-white">
          <div className="container-x grid gap-8 py-16 md:grid-cols-2 md:items-center">
            <div>
              <p className="eyebrow text-gold">How Quote Me Up works</p>
              <h2 className="mt-2 text-3xl font-semibold">A {formatCents(quote.price_cents)} visit that tells you exactly what your piano needs.</h2>
              <p className="mt-4 text-white/80">
                A technician comes to your property, checks the instrument from strings to pedals, and diagnoses everything it requires.
                You get a written offer with itemised prices. Then you decide.
              </p>
              <Link href="/piano-services/book?service=quote-me-up" className="btn-gold mt-6">Book a Quote Me Up visit</Link>
            </div>
            <ul className="space-y-3 text-sm text-white/85">
              {quote.includes.map((item) => (
                <li key={item} className="flex gap-3 rounded-xl bg-white/5 p-4"><span aria-hidden className="text-gold">◆</span>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section id="trade-in" className="container-x grid gap-8 py-16 md:grid-cols-2">
        <div className="card border-gold/40">
          <p className="eyebrow">We buy pianos</p>
          <h2 className="mt-2 text-2xl font-semibold">If you don&apos;t know what to do with your piano, we buy it.</h2>
          <p className="mt-3 text-sm text-ink-soft">
            Inherited an upright, upgrading to a grand, or simply out of space? Send us the details. We assess it, make a fair offer and
            arrange collection. Instruments we buy are serviced and matched with buyers on our list.
          </p>
          <Link href="/piano-services/sell" className="btn-primary mt-6">Get an offer</Link>
        </div>
        <div className="card border-plum/30">
          <p className="eyebrow text-plum">Looking to buy?</p>
          <h2 className="mt-2 text-2xl font-semibold">Tell us what you want and we&apos;ll find it.</h2>
          <p className="mt-3 text-sm text-ink-soft">
            Register your interest with a budget and the type of piano you are after. When a matching instrument comes in, you hear about it first.
            Every piano we sell has been checked by our technician.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/pianos" className="btn-outline">Pianos for sale</Link>
            <Link href="/pianos#wanted" className="btn-ghost">Register interest</Link>
          </div>
        </div>
      </section>
    </>
  )
}
