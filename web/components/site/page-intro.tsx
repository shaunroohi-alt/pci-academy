import Link from 'next/link'
import * as React from 'react'
import { cn } from '@/lib/utils'

/** Kicker, title, lead. The kicker is small caps in gold; the rule beneath draws in once. */
export function PageIntro({ kicker, title, lead, children }: { kicker?: string; title: React.ReactNode; lead?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-12">
      {kicker ? <p className="kicker mb-4">{kicker}</p> : null}
      <h1 className="display text-[40px] sm:text-[52px]">{title}</h1>
      <hr className="rule-draw mt-6 w-16" aria-hidden />
      {lead ? <p className="mt-6 font-display text-[23px] italic leading-snug text-ink-2 sm:text-[26px]">{lead}</p> : null}
      {children}
    </header>
  )
}

/** A heading for a section inside a page. */
export function SectionTitle({ children, id, className }: { children: React.ReactNode; id?: string; className?: string }) {
  return (
    <h2 id={id} className={cn('display mb-5 text-[28px] sm:text-[32px]', className)}>
      {children}
    </h2>
  )
}

/** A quiet text link: ink, with a gold rule beneath. Never a filled button. */
export function TextLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn('label inline-block border-b border-accent pb-0.5 text-ink hover:text-accent', className)}>
      {children}
    </Link>
  )
}

/** The system's closing line, set alone. */
export function CloseLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-16 border-t border-line pt-6 font-display text-[21px] italic text-ink-2">
      {children}
    </p>
  )
}
