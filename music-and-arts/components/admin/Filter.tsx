import Link from 'next/link'
import { humanize } from '@/lib/format'

export function Filter({ base, current, statuses }: { base: string; current?: string; statuses: readonly string[] }) {
  const item = (label: string, href: string, active: boolean) => (
    <Link key={href} href={href} className={`badge ${active ? 'bg-ink text-white' : 'bg-ink/5 text-ink-soft hover:bg-ink/10'}`}>{label}</Link>
  )
  return (
    <div className="flex flex-wrap gap-2">
      {item('All', base, !current)}
      {statuses.map((s) => item(humanize(s), `${base}?status=${s}`, current === s))}
    </div>
  )
}
