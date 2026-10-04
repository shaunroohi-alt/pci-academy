'use client'

import { Archive, BookOpen, CircleUser, Cloud, CloudOff, Ellipsis, GraduationCap, House, NotebookPen, Search, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as React from 'react'
import { BrandBackdrop, Diamond, PIPELINE_GLYPHS } from '@/components/brand/glyphs'
import { PciMark, PciSeal } from '@/components/brand/pci-mark'
import { CANONICAL_PIPELINE } from '@/lib/pci/canon'
import { useApp } from '@/lib/app/context'
import { cn } from '@/lib/utils'

const PRIMARY = [
  { href: '/today/', label: 'Today' },
  { href: '/reflection/', label: 'Reflection' },
  { href: '/ledger/', label: 'Ledger' },
  { href: '/contrary/', label: 'On the Contrary' },
  { href: '/library/', label: 'Library' },
  { href: '/academy/', label: 'Academy' },
  { href: '/media/', label: 'Media' },
  { href: '/production/', label: 'Production' },
]

const MORE = [
  { href: '/contrary/', label: 'On the Contrary', note: 'Examine an apparent error within its system' },
  { href: '/relate/', label: 'Relate', note: 'Patterns, contradictions and connections over time' },
  { href: '/academy/', label: 'Academy', note: 'Courses built on the PCI corpus' },
  { href: '/media/', label: 'Media', note: 'Recorded seminars, courses and visual essays' },
  { href: '/community/', label: 'Community', note: 'Gatherings and seminars' },
  { href: '/services/', label: 'Services', note: 'Consultation and booking' },
  { href: '/production/', label: 'Production', note: 'Coaching, engineering, beats and production' },
  { href: '/search/', label: 'Search', note: 'PCI content and your own material' },
  { href: '/account/', label: 'Account', note: 'Privacy, export, deletion, appearance' },
  { href: '/admin/', label: 'Admin', note: 'PCI Academy content management' },
]

const FOOTER = [
  { title: 'Practice', links: [{ href: '/today/', label: 'Today' }, { href: '/reflection/', label: 'Reflection' }, { href: '/ledger/', label: 'Ledger' }, { href: '/contrary/', label: 'On the Contrary' }, { href: '/relate/', label: 'Relate' }] },
  { title: 'Learn', links: [{ href: '/library/', label: 'Library' }, { href: '/academy/', label: 'Academy' }, { href: '/media/', label: 'Media' }, { href: '/library/glossary/', label: 'Glossary' }] },
  { title: 'Connect', links: [{ href: '/community/', label: 'Community' }, { href: '/services/', label: 'Services' }, { href: '/production/', label: 'Production' }, { href: '/search/', label: 'Search' }, { href: '/account/', label: 'Account' }] },
]

const MOBILE = [
  { href: '/today/', label: 'Today', icon: House },
  { href: '/reflection/', label: 'Reflection', icon: NotebookPen },
  { href: '/ledger/', label: 'Ledger', icon: Archive },
  { href: '/library/', label: 'Library', icon: BookOpen },
]

function isActive(pathname: string, href: string) {
  const p = pathname.replace(/\/+$/, '/') || '/'
  return p === href || (href !== '/' && p.startsWith(href))
}

export function StatusIndicator() {
  const { online, mode, sync } = useApp()
  if (!online) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-2" role="status">
        <CloudOff className="h-3.5 w-3.5" aria-hidden /> Offline — saving on this device
      </span>
    )
  }
  if (mode === 'account' && sync) {
    if (sync.conflicts.length)
      return (
        <Link href="/account/#sync" className="inline-flex items-center gap-1.5 text-[12px] text-danger" role="status">
          <Cloud className="h-3.5 w-3.5" aria-hidden /> {sync.conflicts.length} sync conflict{sync.conflicts.length > 1 ? 's' : ''}
        </Link>
      )
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-muted" role="status">
        <Cloud className="h-3.5 w-3.5" aria-hidden /> {sync.syncing ? 'Syncing…' : sync.pending ? `${sync.pending} waiting to sync` : 'Synced'}
      </span>
    )
  }
  return null
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/'
  const [moreOpen, setMoreOpen] = React.useState(false)
  const dialogRef = React.useRef<HTMLDialogElement>(null)
  const reading = /^\/library\/.+\/.+/.test(pathname) && !pathname.startsWith('/library/glossary')
  // MP Audio is a separate brand with its own chrome (app/mp-audio/layout.tsx).
  const standalone = pathname.startsWith('/mp-audio')

  React.useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (moreOpen && !d.open) d.showModal()
    if (!moreOpen && d.open) d.close()
  }, [moreOpen])

  if (standalone) return <>{children}</>

  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <BrandBackdrop className="absolute -right-[22rem] -top-[18rem] -z-0 hidden w-[56rem] opacity-70 [mask-image:linear-gradient(to_bottom,black_35%,transparent_75%)] md:block" />
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className={cn('no-print sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] backdrop-blur-sm')}>
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2" aria-label="PCI Academy — home">
            <PciSeal size={30} className="h-[30px] w-[30px]" />
            <span className="wordmark text-[17px] text-ink">
              PCI<span className="hidden text-accent sm:inline"> Academy</span>
            </span>
          </Link>
          <nav aria-label="Primary" className="hidden flex-1 items-center gap-1 lg:flex">
            {PRIMARY.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                className={cn('relative rounded-[3px] px-2.5 py-1.5 text-[13px] font-medium transition-colors', isActive(pathname, item.href) ? 'text-ink' : 'text-muted hover:text-ink')}
              >
                {item.label}
                {isActive(pathname, item.href) ? <Diamond className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-accent" /> : null}
              </Link>
            ))}
            <button type="button" onClick={() => setMoreOpen(true)} className="cursor-pointer rounded-[3px] px-2.5 py-1.5 text-[13px] font-medium text-muted hover:text-ink">
              More
            </button>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:inline">
              <StatusIndicator />
            </span>
            <Link href="/search/" className="rounded-[3px] p-2 text-muted hover:text-ink" aria-label="Search">
              <Search className="h-[18px] w-[18px]" />
            </Link>
            <Link href="/account/" className="rounded-[3px] p-2 text-muted hover:text-ink" aria-label="Account">
              <CircleUser className="h-[18px] w-[18px]" />
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className={cn('relative mx-auto w-full px-4 pb-28 pt-8 sm:px-6 lg:pb-16', reading ? 'max-w-4xl' : 'max-w-6xl')}>
        <div className="sm:hidden [&:not(:empty)]:mb-4">
          <StatusIndicator />
        </div>
        {children}
      </main>

      <footer className="no-print relative border-t border-line bg-surface pb-24 lg:pb-0">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <ol aria-label="The canonical process" className="mb-12 flex flex-wrap items-center gap-x-2 gap-y-3 text-brass">
            {CANONICAL_PIPELINE.map((step, i) => {
              const Glyph = PIPELINE_GLYPHS[i]
              return (
                <li key={step} className="flex items-center gap-2">
                  <Glyph className="h-6 w-6" />
                  <span className={cn('text-[11px] font-semibold uppercase tracking-[0.14em]', step === 'STOP' ? 'text-accent' : 'text-muted')}>{step}</span>
                  {i < CANONICAL_PIPELINE.length - 1 ? <span className="mx-1 h-px w-4 bg-brass/60" aria-hidden /> : null}
                </li>
              )
            })}
          </ol>
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div className="flex items-start gap-5">
              <PciMark title={null} className="h-24 w-auto shrink-0 text-brass" />
              <div className="text-[13px] text-ink-2">
                <p className="wordmark text-[15px] text-ink">PCI Academy</p>
                <p className="mt-2">Psycho-Creative Intelligence. Visibility is the output; human choice begins outside the PCI Engine.</p>
              </div>
            </div>
            {FOOTER.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <p className="eyebrow mb-3">{col.title}</p>
                <ul className="space-y-2 text-[13px]">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="text-ink-2 hover:text-accent">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <p className="mt-12 border-t border-line pt-6 text-[12px] text-muted">PCI Academy · Canon 2026.09.25</p>
        </div>
      </footer>

      <nav aria-label="Primary" className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {MOBILE.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive(pathname, href) ? 'page' : undefined}
                className={cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive(pathname, href) ? 'text-ink' : 'text-muted')}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {label}
              </Link>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setMoreOpen(true)} className="flex h-16 w-full cursor-pointer flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted">
              <Ellipsis className="h-5 w-5" aria-hidden />
              More
            </button>
          </li>
        </ul>
      </nav>

      <dialog
        ref={dialogRef}
        onClose={() => setMoreOpen(false)}
        onClick={(e) => e.target === dialogRef.current && setMoreOpen(false)}
        className="m-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-lg border border-line bg-bg p-0 text-ink backdrop:bg-black/40 sm:m-auto sm:max-w-lg sm:rounded-lg"
        aria-label="More"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <p className="eyebrow">More</p>
          <button type="button" onClick={() => setMoreOpen(false)} className="cursor-pointer p-1 text-muted hover:text-ink" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul className="divide-y divide-line">
          {MORE.map((item) => (
            <li key={item.href}>
              <Link href={item.href} onClick={() => setMoreOpen(false)} className="flex items-baseline justify-between gap-4 px-5 py-3.5 hover:bg-surface">
                <span className="font-medium">{item.label}</span>
                <span className="text-right text-[12px] text-muted">{item.note}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 px-5 py-4 text-[12px] text-muted">
          <GraduationCap className="h-4 w-4" aria-hidden /> Canon 2026.09.25
        </div>
      </dialog>
    </div>
  )
}
