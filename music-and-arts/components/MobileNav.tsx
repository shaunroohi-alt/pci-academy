'use client'

import Link from 'next/link'
import { useState } from 'react'
import { nav } from '@/lib/site'

export function MobileNav() {
  const [open, setOpen] = useState(false)
  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost btn-sm"
      >
        {open ? 'Close' : 'Menu'}
      </button>
      {open && (
        <div id="mobile-nav" className="absolute inset-x-0 top-16 border-b border-line bg-cream p-4 shadow-lg">
          <nav className="flex flex-col gap-1" aria-label="Primary mobile">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-base font-medium hover:bg-ink/5">
                {item.label}
              </Link>
            ))}
            <Link href="/piano-services/book" onClick={() => setOpen(false)} className="btn-gold mt-2">
              Book a technician
            </Link>
          </nav>
        </div>
      )}
    </div>
  )
}
