import type { Metadata } from 'next'
import Link from 'next/link'
import { Ornament } from '@/components/brand/pci-mark'
import { MediaCard, MediaPoster } from '@/components/media/media'
import { LinkButton } from '@/components/ui/button'
import { MEDIA, MEDIA_KIND_META, embedUrl, mediaBySlug } from '@/lib/media/catalog'

export const dynamicParams = false

export function generateStaticParams() {
  return MEDIA.map((m) => ({ slug: m.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const item = mediaBySlug(slug)
  return { title: item?.title ?? 'Media', description: item?.summary }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const item = mediaBySlug(slug)
  if (!item) return null
  const embed = item.video ? embedUrl(item.video) : null
  const more = MEDIA.filter((m) => m.slug !== item.slug && m.kind === item.kind).concat(MEDIA.filter((m) => m.slug !== item.slug && m.kind !== item.kind)).slice(0, 3)

  return (
    <article>
      <Link href="/media/" className="text-[13px] font-medium text-accent">
        ← Media
      </Link>
      <div className="mt-6">
        {item.video && item.status === 'available' ? (
          embed ? (
            <div className="aspect-video overflow-hidden rounded-[3px] bg-black">
              <iframe src={embed} title={item.title} className="h-full w-full" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen loading="lazy" />
            </div>
          ) : (
            <video src={item.video} poster={item.poster} controls preload="metadata" className="aspect-video w-full rounded-[3px] bg-black" />
          )
        ) : (
          <MediaPoster item={item} />
        )}
      </div>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <p className="eyebrow mb-3">
            {MEDIA_KIND_META[item.kind].label}
            {item.length ? ` · ${item.length}` : ''}
          </p>
          <h1 className="display text-[40px] leading-[1.05] sm:text-[52px]">{item.title}</h1>
          <p className="mt-5 max-w-2xl font-serif text-[18px] leading-relaxed text-ink-2">{item.summary}</p>
          {item.status === 'forthcoming' ? <p className="mt-5 text-[14px] text-muted">This recording has not been published yet. It will play here when it is.</p> : null}
        </div>
        <aside className="space-y-3 border-l border-line pl-6 text-[14px] text-ink-2">
          {item.presenter ? <p>Presented by {item.presenter}</p> : null}
          {item.date ? <p>{new Date(`${item.date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p> : null}
          <p>Watching is observation, not instruction: what you take from it is yours to decide.</p>
          {item.related ? (
            <LinkButton href={item.related.href} variant="outline" size="sm" className="mt-2">
              {item.related.label}
            </LinkButton>
          ) : null}
        </aside>
      </div>
      {more.length ? (
        <section className="mt-20" aria-labelledby="more-h">
          <Ornament className="mb-10" />
          <h2 id="more-h" className="display mb-8 text-[30px]">
            More to watch
          </h2>
          <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {more.map((m) => (
              <li key={m.slug}>
                <MediaCard item={m} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  )
}
