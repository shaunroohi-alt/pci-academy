import Link from 'next/link'
import { nav, site } from '@/lib/site'
import { MobileNav } from './MobileNav'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-cream/90 backdrop-blur">
      <div className="container-x flex h-16 items-center justify-between gap-4">
        <Link href="/" className="display flex items-center gap-2 text-lg font-semibold tracking-tight text-ink">
          <span aria-hidden className="inline-block h-7 w-7 rounded-md bg-ink text-center text-sm leading-7 text-gold">♪</span>
          {site.name}
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-full px-3.5 py-2 text-sm font-medium text-ink-soft hover:bg-ink/5 hover:text-ink">
              {item.label}
            </Link>
          ))}
          <Link href="/piano-services/book" className="btn-gold btn-sm ml-2">
            Book a technician
          </Link>
        </nav>
        <MobileNav />
      </div>
    </header>
  )
}
