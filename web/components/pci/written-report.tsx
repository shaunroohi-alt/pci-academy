import type { AnalysisVersion } from '@/lib/pci/schema'

function Prose({ text }: { text: string }) {
  return (
    <div className="space-y-4">
      {text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className="font-serif text-[18px] leading-relaxed">
            {p}
          </p>
        ))}
    </div>
  )
}

/** The observation and analysis as prose, written from the material and the engine's findings. */
export function WrittenReport({ writeup }: { writeup: NonNullable<AnalysisVersion['writeup']> }) {
  return (
    <section aria-label="Written report" className="mb-12 max-w-3xl">
      <h2 className="display mb-4 text-[32px]">Observation</h2>
      <Prose text={writeup.observation} />
      <h2 className="display mb-4 mt-10 text-[32px]">Analysis</h2>
      <Prose text={writeup.analysis} />
      {writeup.violations.length ? (
        <p className="mt-4 text-[12px] text-muted">
          The boundary check flagged wording here ({writeup.violations.map((v) => v.rule).join(', ')}). It is shown as written; the structure below is unaffected.
        </p>
      ) : null}
      <p className="mt-6 text-[12px] text-muted">Written by Claude ({writeup.model}) from your material and the findings below. It describes; it does not advise.</p>
    </section>
  )
}
