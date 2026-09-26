import { CONTRADICTION_LABELS, EPISTEMIC_META, TEMPORAL_LABELS, type Confidence, type ContradictionClass, type EpistemicClass, type TemporalClass } from '@/lib/pci/canon'
import { cn } from '@/lib/utils'

const BUCKET_VAR: Record<string, string> = {
  evidence: 'var(--ep-evidence)',
  interpretation: 'var(--ep-interpretation)',
  inference: 'var(--ep-inference)',
  hypothesis: 'var(--ep-hypothesis)',
  symbolic: 'var(--ep-symbolic)',
  philosophical: 'var(--ep-philosophical)',
  unknown: 'var(--ep-unknown)',
}

export function EpistemicBadge({ value, className }: { value: EpistemicClass; className?: string }) {
  const meta = EPISTEMIC_META[value]
  const color = BUCKET_VAR[meta.bucket]
  return (
    <span
      title={meta.meaning}
      className={cn('inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-[0.06em]', className)}
      style={{ color, borderColor: `color-mix(in srgb, ${color} 55%, transparent)` }}
    >
      {meta.label}
    </span>
  )
}

const CONF_DOTS: Record<Confidence, number> = {
  'High Support': 4,
  'Moderate Support': 3,
  'Limited Support': 2,
  'Insufficient Evidence': 1,
  Undetermined: 0,
}

/** Categorical, never numeric (§4.7). The marks are ordinal, not a score. */
export function ConfidenceBadge({ value }: { value: Confidence }) {
  const n = CONF_DOTS[value]
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-2" title="Confidence is categorical: it describes the support available in the material, not certainty.">
      <span className="inline-flex gap-[2px]" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('h-2 w-[3px] rounded-[1px]', i < n ? 'bg-ink-2' : 'bg-line-strong')} />
        ))}
      </span>
      {value}
    </span>
  )
}

export function TemporalBadge({ value }: { value: TemporalClass }) {
  return <span className="rounded-[2px] bg-surface-2 px-1.5 py-px text-[11px] font-medium text-ink-2">{TEMPORAL_LABELS[value]}</span>
}

export function ContradictionBadge({ value }: { value: ContradictionClass }) {
  return <span className="rounded-[2px] bg-surface-2 px-1.5 py-px text-[11px] font-medium text-ink-2">{CONTRADICTION_LABELS[value]}</span>
}

export function Quote({ children, source, className }: { children: React.ReactNode; source?: string; className?: string }) {
  return (
    <blockquote className={cn('border-l-2 border-brass pl-3 font-serif text-[15px] leading-relaxed text-ink', className)}>
      {children}
      {source ? <span className="mt-0.5 block font-sans text-[11px] not-italic text-muted">{source}</span> : null}
    </blockquote>
  )
}
