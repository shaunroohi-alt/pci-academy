import Link from 'next/link'
import { BeginButton } from '@/components/begin-button'
import { BoundaryFigure, EpistemicList, EpistemicRings } from '@/components/brand/figures'
import { ComparisonGlyph, ContradictionGlyph, Diamond, InputGlyph, PIPELINE_GLYPHS, PatternGlyph, ReportGlyph, SeparationGlyph } from '@/components/brand/glyphs'
import { Ornament, PciMark } from '@/components/brand/pci-mark'
import { SevenWheel } from '@/components/brand/seven-wheel'
import { MediaCard } from '@/components/media/media'
import { PreviewGate } from '@/components/preview-gate'
import { LinkButton } from '@/components/ui/button'
import { backendConfigured } from '@/lib/env'
import { MEDIA } from '@/lib/media/catalog'
import { CANONICAL_PIPELINE, CORE_BOUNDARY, PCI_IS_NOT } from '@/lib/pci/canon'
import { cn } from '@/lib/utils'

const ENVIRONMENTS = [
  { title: 'Read', glyph: InputGlyph, body: 'The PCI framework, the glossary, and — as each chapter is approved — The Art of Being, in a reader built for sustained attention.', href: '/library/' },
  { title: 'Reflect', glyph: SeparationGlyph, body: 'One observational subject a day in the journal, or any material submitted for an observational report: separated, compared, classified, and traced to your own words.', href: '/reflection/' },
  { title: 'Document', glyph: PatternGlyph, body: 'An unrestricted Ledger for everything else worth keeping.', href: '/ledger/' },
  { title: 'Examine', glyph: ContradictionGlyph, body: 'On the Contrary: examine an apparent error inside the wider system it belongs to — without forcing it into a positive reading.', href: '/contrary/' },
  { title: 'Relate', glyph: ComparisonGlyph, body: 'With your permission, see how material relates across time: patterns, contradictions, revisions. Nothing becomes an identity claim.', href: '/relate/' },
  { title: 'Learn', glyph: ReportGlyph, body: 'Courses that reuse the canonical corpus, and recorded seminars and lectures. Progress is informational; nothing is scored.', href: '/academy/' },
]

function SectionTitle({ eyebrow, title, id, children }: { eyebrow: string; title: string; id: string; children?: React.ReactNode }) {
  return (
    <div className="mb-12 max-w-2xl">
      <p className="eyebrow mb-3 flex items-center gap-2">
        <Diamond /> {eyebrow}
      </p>
      <h2 id={id} className="display text-[38px] leading-[1.08] sm:text-[46px]">
        {title}
      </h2>
      {children ? <p className="mt-4 font-serif text-[17px] leading-relaxed text-ink-2">{children}</p> : null}
    </div>
  )
}

export default function Home() {
  return (
    <div className="-mt-2">
      {/* Hero: the mark at the centre of its field, the core boundary beneath it. */}
      <section className="relative flex flex-col items-center pb-20 pt-4 text-center lg:pt-10">
        <PciMark className="h-[230px] w-auto text-brass sm:h-[320px]" title="PCI Academy" />
        <p className="eyebrow mt-10">PCI Academy · Psycho-Creative Intelligence</p>
        <h1 className="display mt-4 text-[52px] sm:text-[84px]">Visibility is the output.</h1>
        <p className="mt-6 max-w-2xl font-serif text-[19px] leading-relaxed text-ink-2">
          PCI receives what you bring, separates event from meaning, compares it where evidence allows, and shows you its structure. Then it stops. Human choice begins outside the engine.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <BeginButton />
          <LinkButton href="/library/what-pci-is/" variant="outline" size="lg">
            Read what PCI is
          </LinkButton>
          <LinkButton href="/media/" variant="ghost" size="lg">
            Watch
          </LinkButton>
        </div>
        <p className="mt-10 max-w-xl text-[13px] text-muted">
          {backendConfigured
            ? 'Your material is private to your account, isolated by row-level security, exportable and deletable at any time. It is never used for training.'
            : 'In this edition your material never leaves this device: journal, ledger and reports are stored in your browser, and you can export or delete all of it at any time.'}{' '}
          Comparison with your earlier material is off until you switch it on.
        </p>
      </section>

      <Ornament className="mb-20" />

      {/* The canonical process as a path of glyphs, ending at the capped staff. */}
      <section className="pb-24" aria-labelledby="process-h">
        <SectionTitle eyebrow="The canonical process" title="Seven steps, then a stop." id="process-h">
          Every report follows the same path. Each step makes something more visible; the last step is the boundary itself.
        </SectionTitle>
        <ol className="relative grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4 lg:grid-cols-8">
          <span className="absolute left-[6%] right-[6%] top-7 hidden h-px bg-[linear-gradient(90deg,transparent,var(--brass)_8%,var(--brass)_92%,transparent)] opacity-60 lg:block" aria-hidden />
          {CANONICAL_PIPELINE.map((step, i) => {
            const Glyph = PIPELINE_GLYPHS[i]
            const stop = step === 'STOP'
            return (
              <li key={step} className="relative flex flex-col items-center text-center">
                <span className={cn('grid h-14 w-14 place-items-center rounded-full border bg-bg', stop ? 'border-accent text-accent' : 'border-line text-brass')}>
                  <Glyph className="h-9 w-9" />
                </span>
                <span className="mt-3 text-[11px] font-semibold tracking-[0.14em] text-muted">{String(i + 1).padStart(2, '0')}</span>
                <span className={cn('mt-1 font-display text-[19px] leading-tight', stop && 'font-semibold text-accent')}>{step}</span>
              </li>
            )
          })}
        </ol>
      </section>

      {/* Seven operations around one centre. */}
      <section className="border-t border-line py-24" aria-labelledby="ops-h">
        <SectionTitle eyebrow="Seven operations" title="Seven questions, one centre." id="ops-h">
          Each operation asks a different question of the same material. Choose a point on the circle to read it.
        </SectionTitle>
        <SevenWheel />
        <Link href="/library/seven-operations/" className="mt-10 inline-block text-[13px] font-medium text-accent">
          Read the principles →
        </Link>
      </section>

      {/* Epistemic separation as concentric layers. */}
      <section className="border-t border-line py-24" aria-labelledby="layers-h">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.4fr]">
          <SectionTitle eyebrow="Evidentiary separation" title="Evidence at the centre. Everything else kept apart." id="layers-h">
            A PCI report never blends what is present with what is made of it. Each layer is labelled for what it is, and the unknown stays open at the edge rather than being filled in.
          </SectionTitle>
          <div>
            <EpistemicRings className="hidden sm:block" />
            <EpistemicRings labels={false} className="mx-auto max-w-[320px] sm:hidden" />
            <div className="sm:hidden">
              <EpistemicList />
            </div>
          </div>
        </div>
      </section>

      {/* Environments, each marked by the glyph of what it does. */}
      <section className="border-t border-line py-24" aria-labelledby="env-h">
        <SectionTitle eyebrow="The environments" title="Where the work happens." id="env-h" />
        <div className="grid gap-px overflow-hidden rounded-[4px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {ENVIRONMENTS.map((e) => (
            <Link key={e.title} href={e.href} className="group flex flex-col gap-4 bg-bg p-7 transition-colors hover:bg-surface">
              <e.glyph className="h-12 w-12 text-brass transition-colors group-hover:text-accent" />
              <p className="display text-[28px] group-hover:text-accent">{e.title}</p>
              <p className="text-[14px] text-ink-2">{e.body}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Visual material: placeholder entries, shown in owner preview only until real recordings exist. */}
      <PreviewGate>
        <section className="border-t border-line py-24" aria-labelledby="media-h">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <SectionTitle eyebrow="Media" title="Seminars, courses and visual essays." id="media-h" />
            <Link href="/media/" className="mb-12 text-[13px] font-medium text-accent">
              All media →
            </Link>
          </div>
          <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {MEDIA.slice(0, 3).map((m) => (
              <li key={m.slug}>
                <MediaCard item={m} />
              </li>
            ))}
          </ul>
        </section>
      </PreviewGate>

      {/* The boundary. */}
      <section className="border-t border-line py-24" aria-labelledby="not-h">
        <div className="grid items-center gap-14 lg:grid-cols-[360px_1fr]">
          <BoundaryFigure className="mx-auto" />
          <div>
            <SectionTitle eyebrow="The boundary" title="What PCI is not." id="not-h">
              {CORE_BOUNDARY}
            </SectionTitle>
            <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {PCI_IS_NOT.map((x) => (
                <li key={x} className="flex items-start gap-3 border-b border-line pb-3 font-serif text-[16px]">
                  <Diamond className="mt-2 shrink-0 text-brass" />
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}
