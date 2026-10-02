import Link from 'next/link'
import { BeginButton } from '@/components/begin-button'
import { LinkButton } from '@/components/ui/button'
import { CANONICAL_PIPELINE, CORE_BOUNDARY, PCI_IS_NOT, SEVEN_OPERATIONS } from '@/lib/pci/canon'
import { backendConfigured } from '@/lib/env'

const ENVIRONMENTS = [
  { title: 'Read', body: 'The PCI framework, the glossary, and — as each chapter is approved — The Art of Being, in a reader built for sustained attention.', href: '/library/' },
  { title: 'Reflect', body: 'One observational subject a day in the journal, or any material submitted for an observational report: separated, compared, classified, and traced to your own words.', href: '/reflection/' },
  { title: 'Document', body: 'An unrestricted Ledger for everything else worth keeping.', href: '/ledger/' },
  { title: 'Examine', body: 'On the Contrary: examine an apparent error inside the wider system it belongs to — without forcing it into a positive reading.', href: '/contrary/' },
  { title: 'Relate', body: 'With your permission, see how material relates across time: patterns, contradictions, revisions. Nothing becomes an identity claim.', href: '/relate/' },
  { title: 'Learn', body: 'Courses that reuse the canonical corpus. Progress is informational; nothing is scored.', href: '/academy/' },
]

export default function Home() {
  return (
    <div className="-mt-2">
      <section className="grid gap-10 pb-16 pt-6 lg:grid-cols-[1.2fr_1fr] lg:items-end lg:pt-14">
        <div>
          <p className="eyebrow mb-5">PCI Academy · Psycho-Creative Intelligence</p>
          <h1 className="display text-[54px] sm:text-[76px]">Visibility is the output.</h1>
          <p className="mt-6 max-w-xl font-serif text-[19px] leading-relaxed text-ink-2">
            PCI receives what you bring, separates event from meaning, compares it where evidence allows, and shows you its structure. Then it stops. Human choice begins outside the engine.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <BeginButton />
            <LinkButton href="/library/what-pci-is/" variant="outline" size="lg">
              Read what PCI is
            </LinkButton>
          </div>
        </div>
        <aside className="border-l border-line pl-6 text-[14px] text-ink-2">
          <p className="eyebrow mb-3">Where your material lives</p>
          {backendConfigured ? (
            <p>Your material is private to your account, isolated by row-level security, exportable and deletable at any time. It is never used for training.</p>
          ) : (
            <p>In this edition your material never leaves this device. There is no account and no server: journal, ledger and reports are stored in your browser, and you can export or delete all of it at any time.</p>
          )}
          <p className="mt-3">Comparison with your earlier material is off until you switch it on.</p>
        </aside>
      </section>

      <section className="border-y border-line py-10" aria-labelledby="process-h">
        <h2 id="process-h" className="eyebrow mb-5">
          The canonical process
        </h2>
        <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 font-display text-[21px]">
          {CANONICAL_PIPELINE.map((step, i) => (
            <li key={step} className="flex items-center gap-3">
              <span className={step === 'STOP' ? 'font-semibold text-accent' : ''}>{step}</span>
              {i < CANONICAL_PIPELINE.length - 1 ? <span className="text-brass" aria-hidden>→</span> : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="py-16" aria-labelledby="ops-h">
        <div className="mb-8 flex items-end justify-between gap-4">
          <h2 id="ops-h" className="display text-[36px]">
            Seven questions
          </h2>
          <Link href="/library/seven-operations/" className="text-[13px] font-medium text-accent">
            Read the principles →
          </Link>
        </div>
        <ol className="grid gap-px overflow-hidden rounded-[4px] border border-line bg-line md:grid-cols-2 md:[&>li:last-child]:col-span-2">
          {SEVEN_OPERATIONS.map((op) => (
            <li key={op.key} className="bg-bg p-6">
              <p className="eyebrow mb-2">
                {op.n} · {op.name}
              </p>
              <p className="font-serif text-[17px] leading-relaxed">{op.question}</p>
              <p className="mt-2 text-[13px] text-muted">{op.principle}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-12 border-t border-line py-16 lg:grid-cols-[1fr_1.4fr]" aria-labelledby="not-h">
        <div>
          <h2 id="not-h" className="display text-[36px]">
            What PCI is not
          </h2>
          <p className="mt-4 text-[14px] text-ink-2">{CORE_BOUNDARY}</p>
        </div>
        <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {PCI_IS_NOT.map((x) => (
            <li key={x} className="border-b border-line pb-3 font-serif text-[16px]">
              {x}
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-line py-16" aria-labelledby="env-h">
        <h2 id="env-h" className="display mb-8 text-[36px]">
          The environments
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {ENVIRONMENTS.map((e) => (
            <Link key={e.title} href={e.href} className="group block border-t border-ink pt-4">
              <p className="display text-[26px] group-hover:text-accent">{e.title}</p>
              <p className="mt-2 text-[14px] text-ink-2">{e.body}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
