import Link from 'next/link'
import { nav, site } from '@/lib/site'

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-paper">
      <div className="container-x grid gap-10 py-14 md:grid-cols-3">
        <div>
          <p className="display text-xl font-semibold">{site.name}</p>
          <p className="mt-3 max-w-sm text-sm text-muted">{site.tagline}</p>
        </div>
        <div>
          <p className="eyebrow">Explore</p>
          <ul className="mt-3 space-y-2 text-sm">
            {nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:text-gold-deep">{item.label}</Link>
              </li>
            ))}
            <li><Link href="/piano-services/sell" className="hover:text-gold-deep">Sell us your piano</Link></li>
          </ul>
        </div>
        <div>
          <p className="eyebrow">Get in touch</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/piano-services/book" className="hover:text-gold-deep">Book a technician visit</Link></li>
            <li><Link href="/lessons/enroll" className="hover:text-gold-deep">Enquire about lessons</Link></li>
            <li><Link href="/pianos#wanted" className="hover:text-gold-deep">Tell us what piano you want</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="container-x flex flex-col gap-2 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} {site.name}. All rights reserved.</span>
          <Link href="/admin" className="hover:text-ink">Staff login</Link>
        </div>
      </div>
    </footer>
  )
}
