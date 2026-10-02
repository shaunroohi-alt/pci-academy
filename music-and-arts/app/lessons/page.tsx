import Link from 'next/link'
import type { Metadata } from 'next'
import { PageHero } from '@/components/PageHero'
import { listPackages, listPrograms } from '@/lib/data'
import { formatCents } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Music Lessons for Kids',
  description: 'Classical piano, pop piano, music theory, and songwriting & composition lessons for children, with flexible monthly packages.',
}

export default async function LessonsPage() {
  const [programs, packages] = await Promise.all([listPrograms(), listPackages()])
  const anyPriced = packages.some((p) => p.price_cents != null)
  return (
    <>
      <PageHero
        tone="plum"
        eyebrow="Section two"
        title="Music lessons for kids"
        lead="Patient, structured teaching that builds real musicianship. Choose a program, pick a package, and start with a trial lesson."
        actions={
          <>
            <Link href="/lessons/enroll" className="btn-gold">Enquire about lessons</Link>
            <Link href="#packages" className="btn bg-white/10 text-white hover:bg-white/20">See packages</Link>
          </>
        }
      />

      <section className="container-x py-16">
        <p className="eyebrow text-plum">Programs</p>
        <h2 className="mt-2 text-3xl font-semibold">What we teach</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {programs.map((p) => (
            <article key={p.slug} id={p.slug} className="card scroll-mt-24 border-plum/15">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-2xl font-semibold">{p.name}</h3>
                  <p className="mt-1 text-muted">{p.tagline}</p>
                </div>
                <span className="badge bg-plum-soft text-plum">{p.age_range}</span>
              </div>
              <p className="mt-4 text-sm text-ink-soft">{p.description}</p>
              <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                {p.highlights.map((h) => (
                  <li key={h} className="flex gap-2"><span aria-hidden className="text-plum">✓</span>{h}</li>
                ))}
              </ul>
              <Link href={`/lessons/enroll?program=${p.slug}`} className="btn-outline btn-sm mt-6">Enquire about {p.name}</Link>
            </article>
          ))}
        </div>
      </section>

      <section id="packages" className="scroll-mt-24 bg-paper">
        <div className="container-x py-16">
          <p className="eyebrow text-plum">Packages</p>
          <h2 className="mt-2 text-3xl font-semibold">Pick a rhythm that fits your family</h2>
          <p className="mt-3 max-w-2xl text-muted">
            Packages apply to every program. Monthly packages renew automatically and can be paused with two weeks&apos; notice.
            {!anyPriced && ' Pricing is being finalised and will be published here shortly.'}
          </p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {packages.map((k) => (
              <div key={k.slug} className={`card flex flex-col ${k.slug === 'standard-4x45' ? 'border-gold ring-2 ring-gold/30' : ''}`}>
                {k.slug === 'standard-4x45' && <span className="badge mb-3 w-fit bg-gold-soft text-gold-deep">Most popular</span>}
                <h3 className="text-lg font-semibold">{k.name}</h3>
                <p className="mt-1 text-sm text-muted">{k.lessons_count} × {k.lesson_minutes} min{k.billing === 'monthly' ? ' per month' : ''}</p>
                <p className="mt-3 flex-1 text-sm text-ink-soft">{k.description}</p>
                <p className="display mt-4 text-2xl font-semibold text-plum">{formatCents(k.price_cents, 'TBA')}</p>
                <p className="text-xs text-muted">{k.price_cents == null ? 'Pricing to be announced' : k.billing === 'monthly' ? 'per month' : 'one time'}</p>
                <Link href={`/lessons/enroll?package=${k.slug}`} className="btn-primary btn-sm mt-5">Choose {k.name}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-x py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            ['Trial first', 'Every student starts with a trial lesson so we can meet, set goals and pick the right program.'],
            ['Progress you can hear', 'Short-term goals each month and a recital or recording twice a year.'],
            ['Parents in the loop', 'Clear practice notes after each lesson and a quick check-in each term.'],
          ].map(([title, body]) => (
            <div key={title} className="card">
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
