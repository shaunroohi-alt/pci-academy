import Link from 'next/link'

/** Chapter card: number, title, one line, link. */
export function ChapterCard({ n, title, line, href }: { n: number; title: string; line: string; href: string }) {
  return (
    <li className="border-t border-line">
      <Link href={href} className="group flex gap-5 py-5 sm:gap-8">
        <span className="w-8 shrink-0 pt-1 text-right font-display text-[22px] leading-none text-accent" aria-hidden>
          {n}
        </span>
        <span className="min-w-0">
          <span className="sr-only">Chapter {n}. </span>
          <span className="block font-display text-[24px] leading-tight text-ink group-hover:text-accent">{title}</span>
          <span className="mt-1.5 block font-serif text-[16px] leading-relaxed text-muted">{line}</span>
        </span>
      </Link>
    </li>
  )
}
