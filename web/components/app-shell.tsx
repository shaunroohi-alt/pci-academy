'use client'

import { Cloud, CloudOff } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as React from 'react'
import { SiteFooter } from '@/components/site/site-footer'
import { ENTER, MEMBER_TOOLS, NAV, SITE } from '@/content/site'
import { useApp } from '@/lib/app/context'
import { cn } from '@/lib/utils'

/** Routes that get the member chrome: the tools, Account and Admin. Everything else is the public site. */
const MEMBER_PREFIXES = ['/observe', '/journal', '/contrary', '/account', '/admin'] as const

const ACCOUNT = { href: '/account/', label: 'Account' } as const

function trim(pathname: string) {
  return pathname.replace(/\/+$/, '') || '/'
}

function isActive(pathname: string, href: string) {
  const p = trim(pathname)
  const h = trim(href)
  return p === h || (h !== '/' && p.startsWith(`${h}/`))
}

function isMemberRoute(pathname: string) {
  const p = trim(pathname)
  return MEMBER_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))
}

/** A Library text (chapter, article, sub-chapter): one reading column with room for the margin tools. */
function isReadingRoute(pathname: string) {
  const p = trim(pathname)
  if (/^\/library\/art-of-being\/[^/]+$/.test(p)) return true
  return /^\/library\/[^/]+$/.test(p) && !/^\/library\/(glossary|art-of-being)$/.test(p)
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

function Wordmark() {
  return (
    <Link href="/" className="flex flex-col" aria-label={`${SITE.name} — home`}>
      <span className="display text-[26px] leading-none">{SITE.name}</span>
      <span className="eyebrow mt-1.5 hidden sm:block">{SITE.longName}</span>
    </Link>
  )
}

function PublicHeader({ pathname }: { pathname: string }) {
  const [open, setOpen] = React.useState(false)

  const items = [...NAV, ENTER]

  return (
    <header className="no-print border-b border-line">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-5 sm:px-6">
        <Wordmark />
        <nav aria-label="Primary" className="hidden items-baseline gap-6 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
              className={cn('label border-b pb-0.5 transition-colors', isActive(pathname, item.href) ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink')}
            >
              {item.label}
            </Link>
          ))}
          <Link href={ENTER.href} aria-current={isActive(pathname, ENTER.href) ? 'page' : undefined} className={cn('label ml-4 border-b pb-0.5 transition-colors', isActive(pathname, ENTER.href) ? 'border-accent text-ink' : 'border-line text-muted hover:text-ink')}>
            {ENTER.label}
          </Link>
        </nav>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="site-menu" className="label cursor-pointer border-b border-line pb-0.5 text-muted hover:text-ink md:hidden">
          {open ? 'Close' : 'Menu'}
        </button>
      </div>
      {open ? (
        <nav id="site-menu" aria-label="Menu" className="border-t border-line md:hidden">
          <ul className="mx-auto max-w-6xl px-5 py-2 sm:px-6">
            {items.map((item) => (
              <li key={item.href} className="border-b border-line last:border-b-0">
                <Link href={item.href} onClick={() => setOpen(false)} aria-current={isActive(pathname, item.href) ? 'page' : undefined} className={cn('block py-3 font-display text-[22px]', isActive(pathname, item.href) ? 'text-accent' : 'text-ink')}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  )
}

function MemberHeader({ pathname }: { pathname: string }) {
  const tools = [...MEMBER_TOOLS, ACCOUNT]
  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--bg)_94%,transparent)] backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-5 sm:px-6">
        <Link href="/" className="label shrink-0 text-muted hover:text-ink">
          ← Site
        </Link>
        <span className="h-4 w-px shrink-0 bg-line" aria-hidden />
        <nav aria-label="Tools" className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {tools.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
              className={cn('label shrink-0 whitespace-nowrap rounded-[3px] px-2.5 py-1.5 transition-colors', isActive(pathname, item.href) ? 'text-ink underline decoration-accent underline-offset-[6px]' : 'text-muted hover:text-ink')}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <span className="ml-auto hidden shrink-0 sm:inline">
          <StatusIndicator />
        </span>
      </div>
    </header>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/'
  const member = isMemberRoute(pathname)
  const reading = isReadingRoute(pathname)

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {member ? <MemberHeader pathname={pathname} /> : <PublicHeader pathname={pathname} />}
      <main id="main" className={cn('mx-auto w-full flex-1 px-5 pb-16 pt-10 sm:px-6', reading ? 'max-w-4xl' : member ? 'max-w-6xl' : 'max-w-[720px]')}>
        {member ? (
          <div className="sm:hidden [&:not(:empty)]:mb-4">
            <StatusIndicator />
          </div>
        ) : null}
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
