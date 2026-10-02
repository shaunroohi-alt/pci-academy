import Link from 'next/link'
import { isAdmin } from '@/lib/admin-auth'
import { logout } from './actions'

export const metadata = { title: 'Admin', robots: { index: false, follow: false } }

const links = [
  ['/admin', 'Dashboard'],
  ['/admin/appointments', 'Appointments'],
  ['/admin/pianos', 'Piano listings'],
  ['/admin/buyers', 'Buyers'],
  ['/admin/deals', 'Deals'],
  ['/admin/lessons', 'Lesson enquiries'],
  ['/admin/settings', 'Prices & settings'],
] as const

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await isAdmin()
  return (
    <div className="container-x py-8">
      {admin && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-3">
          <nav className="flex flex-wrap gap-1 text-sm" aria-label="Admin">
            {links.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-full px-3 py-1.5 font-medium text-ink-soft hover:bg-ink/5 hover:text-ink">{label}</Link>
            ))}
          </nav>
          <form action={logout}><button type="submit" className="btn-ghost btn-sm">Log out</button></form>
        </div>
      )}
      {children}
    </div>
  )
}
