import { EPISTEMIC_BUCKETS, EPISTEMIC_BUCKET_LABELS } from '@/lib/pci/canon'
import { cn } from '@/lib/utils'

const BUCKET_NOTES: Record<(typeof EPISTEMIC_BUCKETS)[number], string> = {
  evidence: 'What is present in the material',
  interpretation: 'Frames used to organise it',
  inference: 'Supported, not established',
  hypothesis: 'Possible, with limited support',
  symbolic: 'Metaphor, image, dream, archetype',
  philosophical: 'Claims about meaning and being',
  unknown: 'Cannot presently be established',
}

/** Epistemic separation: evidence at the centre, each further layer kept apart, the unknown as the open boundary. */
export function EpistemicRings({ className, labels = true }: { className?: string; labels?: boolean }) {
  const cx = 190
  const cy = 210
  const n = EPISTEMIC_BUCKETS.length
  return (
    <svg viewBox={labels ? '0 0 640 420' : '0 0 380 420'} className={cn('w-full text-brass', className)} role="img" aria-label="Seven epistemic layers, from evidence at the centre to the unknown at the edge">
      {EPISTEMIC_BUCKETS.map((b, i) => {
        const r = 28 + i * 27
        const a = (-58 + i * 19) * (Math.PI / 180)
        const px = cx + Math.cos(a) * r
        const py = cy + Math.sin(a) * r
        const ly = 34 + i * 58
        const last = i === n - 1
        return (
          <g key={b}>
            {i === 0 ? (
              <circle cx={cx} cy={cy} r={r} fill="currentColor" opacity="0.9" />
            ) : (
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={last ? 2.4 : 1.2} strokeDasharray={last ? '0 8' : undefined} strokeLinecap="round" opacity={1 - i * 0.08} />
            )}
            {labels ? (
              <>
                <path d={`M${px.toFixed(1)} ${py.toFixed(1)} L${(cx + 210).toFixed(0)} ${ly} H392`} fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.55" />
                <circle cx={px} cy={py} r="2.6" fill="currentColor" />
                <text x="402" y={ly + 1} className="fill-ink font-display text-[21px]">
                  {EPISTEMIC_BUCKET_LABELS[b]}
                </text>
                <text x="402" y={ly + 20} className="fill-muted font-sans text-[11.5px]">
                  {BUCKET_NOTES[b]}
                </text>
              </>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

/** Mobile companion to EpistemicRings: the same layers as a list, innermost first. */
export function EpistemicList() {
  return (
    <ol className="mt-8 space-y-3">
      {EPISTEMIC_BUCKETS.map((b, i) => (
        <li key={b} className="flex items-baseline gap-3 border-b border-line pb-3">
          <span className="w-5 text-[11px] font-semibold text-muted">{i + 1}</span>
          <span className="font-display text-[20px]">{EPISTEMIC_BUCKET_LABELS[b]}</span>
          <span className="ml-auto text-right text-[12px] text-muted">{BUCKET_NOTES[b]}</span>
        </li>
      ))}
    </ol>
  )
}

/** The boundary: PCI works inside the circle of observation and stops at its edge. */
export function BoundaryFigure({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 360 384" className={cn('w-full max-w-[360px] text-brass', className)} role="img" aria-label="Observation inside the boundary; human choice outside it">
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <circle cx="180" cy="180" r="168" strokeWidth="2.4" strokeDasharray="0 10" opacity="0.8" />
        <circle cx="180" cy="180" r="112" strokeWidth="1.4" />
        <circle cx="180" cy="180" r="84" strokeWidth="1" opacity="0.5" />
        <path d="M180 30 L232 120 H128 Z" strokeWidth="1" opacity="0.55" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" transform="translate(292 180)">
        <path d="M0 -40 L-7 -28 H7 Z" />
        <rect x="-12" y="-27" width="24" height="5" />
        <path d="M-4 -22 V22 M4 -22 V22" />
        <rect x="-12" y="22" width="24" height="5" />
      </g>
      <circle cx="180" cy="180" r="6" fill="currentColor" />
      <text x="180" y="214" textAnchor="middle" className="fill-ink font-display text-[22px]">
        Observation
      </text>
      <text x="180" y="236" textAnchor="middle" className="fill-muted font-sans text-[10px] uppercase tracking-[0.18em]">
        inside the engine
      </text>
      <text x="180" y="378" textAnchor="middle" className="fill-accent font-sans text-[10px] font-semibold uppercase tracking-[0.18em]">
        Human choice · outside
      </text>
    </svg>
  )
}
