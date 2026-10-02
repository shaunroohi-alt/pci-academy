import type { Metadata } from 'next'
import Link from 'next/link'
import { Diamond } from '@/components/brand/glyphs'
import { MediaCard, MediaPoster } from '@/components/media/media'
import { PageHeader } from '@/components/ui/primitives'
import { MEDIA, MEDIA_KIND_META, MEDIA_KINDS } from '@/lib/media/catalog'

export const metadata: Metadata = {
  title: 'Media',
  description: 'Recorded seminars, online courses, lectures and visual essays from PCI Academy.',
}

export default function Page() {
  const featured = MEDIA.find((m) => m.status === 'available') ?? MEDIA[0]
  const kinds = MEDIA_KINDS.filter((k) => MEDIA.some((m) => m.kind === k))
  return (
    <div>
      <PageHeader eyebrow="Watch" title="Media">
        Recorded seminars, online courses, lectures and visual essays. Each one shows the framework at work on real material; none of them tells you what your material means.
      </PageHeader>

      <nav aria-label="Kinds of material" className="mb-12 flex flex-wrap gap-x-6 gap-y-2 text-[13px] font-medium">
        {kinds.map((k) => (
          <a key={k} href={`#${k}`} className="inline-flex items-center gap-2 text-muted hover:text-accent">
            <Diamond className="text-brass" /> {MEDIA_KIND_META[k].plural}
          </a>
        ))}
      </nav>

      {featured ? (
        <Link href={`/media/${featured.slug}/`} className="group mb-20 grid items-center gap-8 lg:grid-cols-[1.5fr_1fr]">
          <MediaPoster item={featured} className="shadow-[0_0_0_1px_var(--line)]" />
          <div>
            <p className="eyebrow mb-3">Featured · {MEDIA_KIND_META[featured.kind].label}</p>
            <h2 className="display text-[38px] leading-[1.05] group-hover:text-accent">{featured.title}</h2>
            <p className="mt-4 font-serif text-[17px] leading-relaxed text-ink-2">{featured.summary}</p>
            <p className="mt-4 text-[13px] text-muted">
              {featured.length}
              {featured.status === 'forthcoming' ? ' · Recording forthcoming' : ''}
            </p>
          </div>
        </Link>
      ) : null}

      {kinds.map((k) => (
        <section key={k} id={k} className="mb-16 scroll-mt-24 border-t border-brass pt-8" aria-labelledby={`${k}-h`}>
          <div className="mb-8 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <h2 id={`${k}-h`} className="display text-[32px]">
              {MEDIA_KIND_META[k].plural}
            </h2>
            <p className="text-[13px] text-muted">{MEDIA_KIND_META[k].note}</p>
          </div>
          <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {MEDIA.filter((m) => m.kind === k).map((m) => (
              <li key={m.slug}>
                <MediaCard item={m} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
