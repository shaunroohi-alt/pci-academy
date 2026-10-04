import Link from 'next/link'
import { MpLogo, MpWordmark } from './brand'

const NAV = [
  { href: '/mp-audio/#plugins', label: 'Plugins' },
  { href: '/mp-audio/#pricing', label: 'Pricing' },
  { href: '/mp-audio/#rent-to-own', label: 'Rent-to-own' },
  { href: '/mp-audio/#faq', label: 'FAQ' },
]

/** MP Audio's own chrome. The PCI app shell steps aside for /mp-audio (see app-shell.tsx). */
export function MpShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mpa relative min-h-dvh overflow-x-clip">
      <a href="#mpa-main" className="skip-link">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-[var(--mpa-line)] bg-[color-mix(in_srgb,var(--mpa-bg)_88%,transparent)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/mp-audio/" className="flex items-center gap-2.5" aria-label="MP Audio home">
            <MpLogo size={32} />
            <MpWordmark className="text-[14px] text-[var(--mpa-ink)]" />
          </Link>
          <nav aria-label="MP Audio" className="hidden flex-1 items-center gap-1 md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-[13px] font-medium text-[var(--mpa-muted)] hover:text-[var(--mpa-ink)]">
                {n.label}
              </a>
            ))}
          </nav>
          <a href="/mp-audio/#waitlist" className="mpa-btn mpa-btn-primary ml-auto h-9 px-4 text-[13px]">
            Get early access
          </a>
        </div>
      </header>
      <main id="mpa-main">{children}</main>
      <footer className="border-t border-[var(--mpa-line)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-[13px] text-[var(--mpa-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2.5">
            <MpLogo size={26} />
            <MpWordmark className="text-[12px] text-[var(--mpa-ink)]" />
          </div>
          <nav aria-label="MP Audio footer" className="flex flex-wrap gap-x-5 gap-y-2">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="hover:text-[var(--mpa-ink)]">
                {n.label}
              </a>
            ))}
            <Link href="/" className="hover:text-[var(--mpa-ink)]">
              PCI Academy
            </Link>
          </nav>
          <p>© {new Date().getFullYear()} MP Audio</p>
        </div>
      </footer>
    </div>
  )
}
