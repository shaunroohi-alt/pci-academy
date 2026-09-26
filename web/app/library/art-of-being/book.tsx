'use client'

import Link from 'next/link'
import { useApp } from '@/lib/app/context'
import { hrefFor, published } from '@/lib/content/catalog'

export function Book() {
  const { content, ready } = useApp()
  const chapters = published(content).filter((c) => c.collection === 'art-of-being')
  return (
    <div className="mx-auto max-w-2xl">
      <p className="eyebrow mb-3">PCI Academy · The book</p>
      <h1 className="display text-[52px] sm:text-[64px]">The Art of Being</h1>
      {!ready ? null : chapters.length ? (
        <nav aria-label="Contents" className="mt-10">
          <p className="eyebrow mb-3">Contents</p>
          <ol className="divide-y divide-line border-y border-line">
            {chapters.map((c) => (
              <li key={c.slug}>
                <Link href={hrefFor(c)} className="group flex items-baseline gap-4 py-3">
                  <span className="w-8 shrink-0 text-right font-display text-[20px] text-muted">{c.type === 'chapter' ? c.order : ''}</span>
                  <span className="font-serif text-[18px] group-hover:text-accent">{c.title}</span>
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      ) : (
        <div className="mt-10 space-y-4 font-serif text-[18px] leading-relaxed text-ink-2">
          <p>The Art of Being is being prepared for publication.</p>
          <p>Chapters are published here only when their complete, approved text is available. Until then the book is not represented by titles alone.</p>
          <p className="font-sans text-[14px]">
            The <Link href="/library/" className="text-accent">PCI Framework</Link> texts are available in full now.
          </p>
        </div>
      )}
    </div>
  )
}
