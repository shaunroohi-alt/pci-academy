'use client'

import Link from 'next/link'
import { PageHeader } from '@/components/ui/primitives'
import { useApp, useData } from '@/lib/app/context'
import { GLOSSARY_TERMS, hrefFor, published } from '@/lib/content/catalog'
import { CANON_STATUS_META } from '@/lib/pci/canon'

export function LibraryIndex() {
  const { content } = useApp()
  const items = published(content)
  const framework = items.filter((i) => i.collection === 'pci-framework')
  const book = items.filter((i) => i.collection === 'art-of-being')
  const articles = items.filter((i) => i.collection === 'articles')
  const { data: positions } = useData((r) => r.readingPositions(), [])
  const reading = positions?.[0]

  return (
    <div>
      <PageHeader eyebrow="Read" title="Library">
        The complete published PCI corpus. Only full, approved texts appear here; nothing is listed by title alone.
      </PageHeader>

      {reading ? (
        <Link href={reading.href} className="mb-10 block rounded-[4px] border border-line bg-raised p-5 hover:bg-surface">
          <p className="eyebrow mb-1">Continue reading</p>
          <p className="font-serif text-[18px]">{reading.content_title}</p>
          <div className="mt-2 h-[3px] rounded-full bg-line-strong" aria-hidden>
            <div className="h-[3px] rounded-full bg-ink" style={{ width: `${Math.round(reading.progress * 100)}%` }} />
          </div>
        </Link>
      ) : null}

      <section className="mb-14" aria-labelledby="framework-h">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 id="framework-h" className="display text-[32px]">
            The PCI Framework
          </h2>
          <span className="text-[12px] text-muted">{framework.length} texts</span>
        </div>
        <ol className="grid gap-x-10 sm:grid-cols-2">
          {framework.map((f) => (
            <li key={f.slug} className="border-t border-line">
              <Link href={hrefFor(f)} className="group block py-4">
                <span className="flex items-baseline gap-3">
                  <span className="w-6 shrink-0 font-display text-[18px] text-muted">{f.order}</span>
                  <span>
                    <span className="block font-serif text-[18px] group-hover:text-accent">{f.title}</span>
                    <span className="mt-1 block text-[13px] text-muted">{f.summary}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-14 grid gap-10 border-t border-ink pt-8 lg:grid-cols-[1fr_1.3fr]" aria-labelledby="aob-h">
        <div>
          <h2 id="aob-h" className="display text-[32px]">
            The Art of Being
          </h2>
          <p className="mt-2 text-[14px] text-ink-2">The PCI book. Chapters appear here as each complete, approved text is published.</p>
          <Link href="/library/art-of-being/" className="mt-3 inline-block text-[13px] font-medium text-accent">
            Open the book →
          </Link>
        </div>
        {book.length ? (
          <ol className="space-y-1">
            {book.map((c) => (
              <li key={c.slug}>
                <Link href={hrefFor(c)} className="flex gap-3 py-1.5 font-serif text-[16px] hover:text-accent">
                  <span className="w-6 text-muted">{c.order || ''}</span>
                  {c.title}
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="self-center font-serif text-[16px] italic text-muted">No chapter has been published yet.</p>
        )}
      </section>

      {articles.length ? (
        <section className="mb-14 border-t border-ink pt-8" aria-labelledby="articles-h">
          <h2 id="articles-h" className="display mb-5 text-[32px]">
            Articles
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {articles.map((a) => (
              <li key={a.slug}>
                <Link href={`/library/view/?slug=${a.slug}`} className="block rounded-[3px] border border-line p-4 hover:bg-surface">
                  <span className="font-serif text-[17px]">{a.title}</span>
                  <span className="mt-1 block text-[12px] text-muted">{CANON_STATUS_META[a.canon_status].label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="border-t border-ink pt-8" aria-labelledby="glossary-h">
        <div className="flex items-baseline justify-between">
          <h2 id="glossary-h" className="display text-[32px]">
            Glossary
          </h2>
          <Link href="/library/glossary/" className="text-[13px] font-medium text-accent">
            All {GLOSSARY_TERMS.length} terms →
          </Link>
        </div>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-2">Definitions of PCI terms, each with its canon status and source. Terms in the texts link here.</p>
      </section>
    </div>
  )
}
