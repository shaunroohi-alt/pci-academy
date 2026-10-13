import Link from 'next/link'
import { listPrograms, listServices } from '@/lib/data'
import { formatCents } from '@/lib/format'
import { site } from '@/lib/site'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [services, programs] = await Promise.all([listServices(), listPrograms()])
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #fff 0 1px, transparent 1px 48px)' }} />
        <div className="container-x relative py-20 sm:py-28">
          <p className="eyebrow text-gold">{site.name}</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight sm:text-6xl">
            Piano care, piano trading and music lessons under one roof.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-white/80">
            Book a technician to tune or fully service your piano. Sell us the piano you no longer play, or find one to buy.
            Enrol your child in classical piano, pop piano, theory or songwriting.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/piano-services/book" className="btn-gold">Book a technician</Link>
            <Link href="/lessons" className="btn bg-white/10 text-white hover:bg-white/20">Explore music lessons</Link>
          </div>
        </div>
      </section>

      {/* Two doors */}
      <section className="container-x -mt-10 grid gap-6 md:grid-cols-2">
        <Link href="/piano-services" className="card group relative overflow-hidden border-gold/30 transition hover:-translate-y-0.5 hover:shadow-lg">
          <p className="eyebrow">Section one</p>
          <h2 className="mt-2 text-2xl font-semibold">Piano Technician Services</h2>
          <p className="mt-3 text-muted">Tuning, regulation, full service, or a $30 diagnostic visit with a written offer. Plus: we buy pianos.</p>
          <span className="mt-6 inline-block text-sm font-semibold text-gold-deep group-hover:underline">See services and prices →</span>
        </Link>
        <Link href="/lessons" className="card group relative overflow-hidden border-plum/30 transition hover:-translate-y-0.5 hover:shadow-lg">
          <p className="eyebrow text-plum">Section two</p>
          <h2 className="mt-2 text-2xl font-semibold">Music Lessons for Kids</h2>
          <p className="mt-3 text-muted">Classical piano, pop piano, music theory, and songwriting & composition. Packages from a single trial lesson to twice-weekly.</p>
          <span className="mt-6 inline-block text-sm font-semibold text-plum group-hover:underline">See programs and packages →</span>
        </Link>
      </section>

      {/* Services summary */}
      <section className="container-x py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Piano technician</p>
            <h2 className="mt-2 text-3xl font-semibold">Four ways to look after your piano</h2>
          </div>
          <Link href="/piano-services" className="btn-outline btn-sm">All details</Link>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((s) => (
            <Link key={s.slug} href={`/piano-services#${s.slug}`} className="card flex flex-col transition hover:border-gold/60">
              <h3 className="text-lg font-semibold">{s.name}</h3>
              <p className="mt-2 flex-1 text-sm text-muted">{s.tagline}</p>
              <p className="mt-4 text-sm font-semibold text-gold-deep">{formatCents(s.price_cents, s.price_note || 'Price to be announced')}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Trade-in band */}
      <section className="bg-gold-soft">
        <div className="container-x grid gap-8 py-16 md:grid-cols-[1.2fr_1fr] md:items-center">
          <div>
            <p className="eyebrow">We buy pianos</p>
            <h2 className="mt-2 text-3xl font-semibold">Don&apos;t know what to do with your piano? We&apos;ll buy it.</h2>
            <p className="mt-4 max-w-xl text-ink-soft">
              Tell us about the instrument, send a few photos, and we come back with an honest offer. We also keep a list of people
              looking for pianos, so a good instrument finds a new home quickly.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/piano-services/sell" className="btn-primary">Sell us your piano</Link>
              <Link href="/pianos" className="btn-outline">Browse pianos for sale</Link>
            </div>
          </div>
          <ol className="space-y-4 text-sm">
            {['You submit the details and photos.', 'A technician reviews it, or visits for a $30 Quote Me Up.', 'We make you an offer and handle pickup.', 'We match it with a buyer on our waiting list.'].map((step, i) => (
              <li key={step} className="flex gap-3 rounded-xl bg-white/70 p-4">
                <span className="display flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-gold">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Lessons summary */}
      <section className="container-x py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-plum">Music lessons</p>
            <h2 className="mt-2 text-3xl font-semibold">Four programs, taught for the long run</h2>
          </div>
          <Link href="/lessons" className="btn-outline btn-sm">Packages and pricing</Link>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {programs.map((p) => (
            <Link key={p.slug} href={`/lessons#${p.slug}`} className="card flex flex-col border-plum/15 transition hover:border-plum/50">
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="mt-2 flex-1 text-sm text-muted">{p.tagline}</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-plum">{p.age_range}</p>
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}
