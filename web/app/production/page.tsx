import type { Metadata } from 'next'
import { Diamond } from '@/components/brand/glyphs'
import { EnquiryForm, EnquireLink } from '@/components/production/enquiry'
import { PageHeader } from '@/components/ui/primitives'
import { PRODUCTION_CATEGORIES, type ProductionService } from '@/lib/production/services'

export const metadata: Metadata = {
  title: 'Production',
  description: 'Vocal, artist and production coaching, audio and mix engineering, beats and co-production from PCI Academy.',
}

function ServiceCard({ service }: { service: ProductionService }) {
  return (
    <article className="flex h-full flex-col rounded-[4px] border border-line bg-raised p-6">
      <h3 className="display text-[24px] leading-tight">{service.title}</h3>
      {service.summary ? <p className="mt-2 text-[14px] text-ink-2">{service.summary}</p> : null}
      {service.includes?.length ? (
        <ul className="mt-3 space-y-1 text-[14px] text-ink-2">
          {service.includes.map((i) => (
            <li key={i} className="flex items-center gap-2">
              <Diamond className="text-brass" /> {i}
            </li>
          ))}
        </ul>
      ) : null}
      <dl className="mt-5 space-y-3 border-t border-line pt-4">
        {service.prices.map((p) => (
          <div key={`${p.label}-${p.amount}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <dt className="text-[13px] text-muted">{p.label ?? p.unit ?? 'Price'}</dt>
            <dd className="text-right">
              <span className="display text-[26px] text-accent">{p.amount}</span>
              {p.label && p.unit ? <span className="ml-2 text-[13px] text-muted">{p.unit}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto pt-5">
        <EnquireLink service={service.title} />
      </div>
    </article>
  )
}

export default function Page() {
  return (
    <div>
      <PageHeader eyebrow="Studio" title="Production">
        Coaching, engineering and production with PCI Academy. Choose a service and send an enquiry; we reply to confirm availability and the next step.
      </PageHeader>

      <nav aria-label="Service categories" className="mb-12 flex flex-wrap gap-x-6 gap-y-2 text-[13px] font-medium">
        {PRODUCTION_CATEGORIES.map((c) => (
          <a key={c.slug} href={`#${c.slug}`} className="inline-flex items-center gap-2 text-muted hover:text-accent">
            <Diamond className="text-brass" /> {c.title}
          </a>
        ))}
        <a href="#enquire" className="inline-flex items-center gap-2 text-muted hover:text-accent">
          <Diamond className="text-brass" /> Enquire
        </a>
      </nav>

      {PRODUCTION_CATEGORIES.map((c) => (
        <section key={c.slug} id={c.slug} className="mb-16 scroll-mt-24 border-t border-brass pt-8" aria-labelledby={`${c.slug}-h`}>
          <div className="mb-8 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <h2 id={`${c.slug}-h`} className="display text-[32px]">
              {c.title}
            </h2>
            <p className="text-[13px] text-muted">{c.note}</p>
          </div>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {c.services.map((s) => (
              <li key={s.slug}>
                <ServiceCard service={s} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <EnquiryForm />
    </div>
  )
}
