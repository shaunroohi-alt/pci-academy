import { BOUNDARY_LIST } from '@/content/site'

/** Boundary list: the five lines, as given. */
export function BoundaryList() {
  return (
    <ul aria-label="What this is not" className="border-b border-line">
      {BOUNDARY_LIST.map((line) => (
        <li key={line} className="flex gap-5 border-t border-line py-4 sm:gap-8">
          <span className="mt-[0.85em] h-px w-8 shrink-0 bg-accent" aria-hidden />
          <span className="font-display text-[23px] leading-snug text-ink">{line}</span>
        </li>
      ))}
    </ul>
  )
}
