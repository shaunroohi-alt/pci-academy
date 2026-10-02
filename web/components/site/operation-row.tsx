/** Operation row: number, name, question. */
export function OperationRow({ n, name, q }: { n: number; name: string; q: string }) {
  return (
    <li className="border-t border-line">
      <div className="flex gap-5 py-5 sm:gap-8">
        <span className="w-8 shrink-0 pt-1 text-right font-display text-[22px] leading-none text-accent" aria-hidden>
          {n}
        </span>
        <div className="min-w-0">
          <p className="font-display text-[24px] leading-tight text-ink">
            <span className="sr-only">{n}. </span>
            {name}
          </p>
          <p className="mt-1.5 font-serif text-[17px] leading-relaxed text-ink-2">{q}</p>
        </div>
      </div>
    </li>
  )
}
