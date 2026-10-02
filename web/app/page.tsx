import { CloseLine, TextLink } from '@/components/site/page-intro'
import { SITE } from '@/content/site'

const THREE_LINES = [
  'Ability is capacity. Skill is capacity organized. Identity is the story that decides which of those may count.',
  'You were finished at birth. Growth changes function. It does not buy worth.',
  'Visibility is not obligation.',
] as const

export default function Home() {
  return (
    <div>
      <header className="pt-6 sm:pt-12">
        <p className="kicker mb-5">{SITE.longName}</p>
        <h1 className="display text-[56px] leading-[1.02] sm:text-[80px]">{SITE.book}</h1>
        <hr className="rule-draw mt-8 w-16" aria-hidden />
        <p className="mt-8 font-display text-[26px] italic leading-snug text-ink-2 sm:text-[30px]">You are not missing anything. You are missing sight of something.</p>
      </header>

      <div className="site-body mt-10">
        <p>PCI is an observational method. It separates what happened from what was decided about it. It reports what can be seen. Then it stops. The direction is yours.</p>
      </div>

      <ul className="mt-14 border-b border-line">
        {THREE_LINES.map((line) => (
          <li key={line} className="flex gap-5 border-t border-line py-5 sm:gap-8">
            <span className="mt-[0.8em] h-px w-8 shrink-0 bg-accent" aria-hidden />
            <span className="font-display text-[22px] leading-snug text-ink sm:text-[24px]">{line}</span>
          </li>
        ))}
      </ul>

      <nav aria-label="Begin" className="mt-12 flex flex-wrap items-baseline gap-x-10 gap-y-4">
        <TextLink href="/art-of-being/" className="text-[15px]">
          Read the book
        </TextLink>
        <TextLink href="/method/" className="border-line text-muted">
          The method
        </TextLink>
      </nav>

      <CloseLine>{SITE.close}</CloseLine>
    </div>
  )
}
