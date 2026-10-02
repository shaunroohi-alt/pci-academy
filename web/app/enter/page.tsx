import type { Metadata } from 'next'
import Link from 'next/link'
import { PageIntro, TextLink } from '@/components/site/page-intro'
import { MEMBER_TOOLS } from '@/content/site'
import { backendConfigured } from '@/lib/env'

export const metadata: Metadata = {
  title: 'Enter',
  description: 'A private page for writing and looking. Optional analysis. Then a stop.',
}

/** The three tools, named only. Library is public and is already in the nav. */
const TOOLS = MEMBER_TOOLS.filter((t) => t.href !== '/library/')

export default function Page() {
  return (
    <div>
      <PageIntro title="Enter" lead="A private page for writing and looking. Optional analysis. Then a stop." />

      <ul aria-label="Tools" className="border-b border-line">
        {TOOLS.map((t) => (
          <li key={t.href} className="border-t border-line">
            <Link href={t.href} className="group flex items-baseline gap-5 py-5 sm:gap-8">
              <span className="mt-[0.7em] h-px w-8 shrink-0 self-start bg-accent" aria-hidden />
              <span className="font-display text-[26px] leading-tight text-ink group-hover:text-accent">{t.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-10 font-display text-[21px] italic text-ink-2">Nothing has been entered. There is no score for an empty page.</p>

      <div className="label mt-12 space-y-3 text-muted">
        {backendConfigured ? <p>Material entered here is private to your account, exportable and deletable at any time.</p> : <p>Material entered here stays on this device. There is no account and no server.</p>}
        <p>
          <TextLink href="/account/" className="text-muted">
            Privacy and export
          </TextLink>
        </p>
      </div>
    </div>
  )
}
