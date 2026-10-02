'use client'

import { Archive, BookOpen, CircleUser, Cloud, CloudOff, Ellipsis, GraduationCap, House, NotebookPen, Search, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as React from 'react'
import { useApp } from '@/lib/app/context'
import { cn } from '@/lib/utils'

const PRIMARY = [
  { href: '/today/', label: 'Today' },
  { href: '/reflection/', label: 'Reflection' },
  { href: '/ledger/', label: 'Ledger' },
  { href: '/contrary/', label: 'On the Contrary' },
  { href: '/library/', label: 'Library' },
  { href: '/academy/', label: 'Academy' },
]

const MORE = [
  { href: '/contrary/', label: 'On the Contrary', note: 'Examine an apparent error within its system' },
  { href: '/relate/', label: 'Relate', note: 'Patterns, contradictions and connections over time' },
  { href: '/academy/', label: 'Academy', note: 'Courses built on the PCI corpus' },
  { href: '/community/', label: 'Community', note: 'Gatherings and seminars' },
  { href: '/services/', label: 'Services', note: 'Consultation and booking' },
  { href: '/search/', label: 'Search', note: 'PCI content and your own material' },
  { href: '/account/', label: 'Account', note: 'Privacy, export, deletion, appearance' },
  { href: '/admin/', label: 'Admin', note: 'PCI Academy content management' },
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

  React.useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (moreOpen && !d.open) d.showModal()
    if (!moreOpen && d.open) d.close()
  }, [moreOpen])

  return (
    <div className="min-h-dvh">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className={cn('no-print sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] backdrop-blur-sm')}>
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2" aria-label="PCI Academy — home">
            <svg viewBox="0 0 512 512" className="h-6 w-6" aria-hidden>
              <rect width="512" height="512" rx="96" fill="var(--ink)" />
              <path fill="var(--brass)" fillRule="evenodd" d="M256 106a150 150 0 1 0 .1 0zM256 140a116 116 0 1 1-.1 0z" />
              <circle cx="256" cy="256" r="75" fill="var(--brass)" />
            </svg>
            <span className="display text-[21px] tracking-tight">PCI</span>
          </Link>
          <nav aria-label="Primary" className="hidden flex-1 items-center gap-1 lg:flex">
            {PRIMARY.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                className={cn('rounded-[3px] px-2.5 py-1.5 text-[13px] font-medium transition-colors', isActive(pathname, item.href) ? 'text-ink' : 'text-muted hover:text-ink')}
              >
                {item.label}
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

      <main id="main" className={cn('mx-auto w-full px-4 pb-28 pt-8 sm:px-6 lg:pb-16', reading ? 'max-w-4xl' : 'max-w-6xl')}>
        <div className="sm:hidden [&:not(:empty)]:mb-4">
          <StatusIndicator />
        </div>
        {children}
      </main>

      <footer className="no-print mx-auto hidden max-w-6xl border-t border-line px-6 py-8 text-[12px] text-muted lg:block">
        <p>PCI Academy · Psycho-Creative Intelligence · Canon 2026.09.25</p>
        <p className="mt-1">Visibility is the output. Human choice begins outside the PCI Engine.</p>
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
