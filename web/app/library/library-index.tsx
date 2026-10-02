import Link from 'next/link'
import { ArticleCard } from '@/components/site/article-card'
import { ChapterCard } from '@/components/site/chapter-card'
import { PageIntro, SectionTitle } from '@/components/site/page-intro'
import { ARTICLES, CHAPTERS, SITE, SUB_CHAPTERS } from '@/content/site'

/** Library: articles, sub-chapters filed under Individualism, and the twelve chapters. Nothing is counted or assigned. */
export function LibraryIndex() {
  return (
    <div>
      <PageIntro title="Library" lead="Chapters, sub-chapters, and companion articles. Readable. Not assigned." />

      <section className="mb-16" aria-labelledby="articles-h">
        <SectionTitle id="articles-h">Articles</SectionTitle>
        <ol aria-label="Articles" className="border-b border-line">
          {ARTICLES.map((a) => (
            <ArticleCard key={a.slug} letter={a.letter} title={a.title} line={a.line} href={`/library/${a.slug}/`} />
          ))}
        </ol>
      </section>

      <section className="mb-16" aria-labelledby="sub-h">
        <SectionTitle id="sub-h">Sub-chapters</SectionTitle>
        <p className="label mb-5 text-muted">Filed under Individualism.</p>
        <ul aria-label="Sub-chapters" className="border-b border-line">
          {SUB_CHAPTERS.map((s) => (
            <li key={s.slug} className="border-t border-line">
              <Link href={`/library/${s.slug}/`} className="group flex gap-5 py-5 sm:gap-8">
                <span className="mt-[0.7em] h-px w-8 shrink-0 bg-accent" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-display text-[24px] leading-tight text-ink group-hover:text-accent">{s.title}</span>
                  <span className="label mt-1.5 block text-muted">
                    Chapter {CHAPTERS.find((c) => c.slug === s.parent)?.n ?? 5} · {s.parentTitle}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="chapters-h">
        <SectionTitle id="chapters-h">The twelve chapters</SectionTitle>
        <ol aria-label="Chapters" className="border-b border-line">
          {CHAPTERS.map((c) => (
            <ChapterCard key={c.slug} n={c.n} title={c.title} line={c.line} href={`/library/art-of-being/${c.slug}/`} />
          ))}
        </ol>
      </section>

      <p className="mt-16 font-display text-[19px] italic text-ink-2">{SITE.libraryEnding}</p>
    </div>
  )
}
