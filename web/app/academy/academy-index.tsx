import { PageIntro, SectionTitle } from '@/components/site/page-intro'

/** Academy: a library and a place to look. No courses, no progress. */
export function AcademyIndex() {
  return (
    <div>
      <PageIntro title="Academy" lead="A library and a place to look. Not a course that completes you." />
      <div className="site-body">
        <p>Gatherings and one-to-one work, if they exist, are a separate context. They do not write into an observation. The Academy does not assign a type, a practice, or a streak.</p>
      </div>

      <section className="mt-14" aria-labelledby="here-h">
        <SectionTitle id="here-h">What is here</SectionTitle>
        <div className="site-body border-t border-line pt-5">
          <p>The book, the articles, the method.</p>
        </div>
      </section>

      <section className="mt-14" aria-labelledby="not-here-h">
        <SectionTitle id="not-here-h">What is not here</SectionTitle>
        <div className="site-body border-t border-line pt-5">
          <p>Booklets as products, Reading types as identities, homework attached to a report.</p>
        </div>
      </section>
    </div>
  )
}
