import { ChapterCard } from '@/components/site/chapter-card'
import { PageIntro } from '@/components/site/page-intro'
import { CHAPTERS } from '@/content/site'

/** The book page: kicker, title, lead, twelve chapter cards. Used at /art-of-being/ and /library/art-of-being/. */
export function BookIndex() {
  return (
    <div>
      <PageIntro kicker="The book" title="Twelve chapters. Not a program." lead="The live text is the Author’s Voice rewrite. Recognition before refinement. Performance as the default state. Completeness as the starting point." />
      <ol aria-label="Chapters" className="border-b border-line">
        {CHAPTERS.map((c) => (
          <ChapterCard key={c.slug} n={c.n} title={c.title} line={c.line} href={`/library/art-of-being/${c.slug}/`} />
        ))}
      </ol>
    </div>
  )
}
