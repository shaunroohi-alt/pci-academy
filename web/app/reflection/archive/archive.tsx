'use client'

import Link from 'next/link'
import * as React from 'react'
import { Badge, Empty, Input, PageHeader } from '@/components/ui/primitives'
import { LinkButton } from '@/components/ui/button'
import { useData } from '@/lib/app/context'
import { formatDate } from '@/lib/utils'

export function JournalArchive() {
  const { data: entries, loading } = useData((r) => r.journalEntries(), [])
  const [q, setQ] = React.useState('')
  const [tag, setTag] = React.useState<string | null>(null)
  const tags = React.useMemo(() => [...new Set((entries ?? []).flatMap((e) => e.tags))].sort(), [entries])
  const needle = q.trim().toLowerCase()
  const shown = (entries ?? []).filter((e) => (!tag || e.tags.includes(tag)) && (!needle || `${e.body} ${e.prompt_text} ${e.follow_ups.map((f) => f.text).join(' ')}`.toLowerCase().includes(needle)))

  return (
    <div>
      <PageHeader eyebrow="Reflection" title="Journal archive" actions={<LinkButton href="/reflection/" variant="outline" size="sm">Today’s entry</LinkButton>}>
        Every entry, newest first. Private to you.
      </PageHeader>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search entries" aria-label="Search entries" className="sm:max-w-sm" />
        {tags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <button key={t} type="button" onClick={() => setTag(tag === t ? null : t)} aria-pressed={tag === t} className="cursor-pointer">
                <Badge tone={tag === t ? 'solid' : 'neutral'}>{t}</Badge>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {loading ? null : shown.length ? (
        <ul className="divide-y divide-line border-y border-line">
          {shown.map((e) => (
            <li key={e.id}>
              <Link href={e.source ? `/academy/${e.source.id}/` : `/reflection/?date=${e.date}`} className="block py-4 hover:bg-surface sm:px-2">
                <p className="eyebrow">{formatDate(e.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
                <p className="mt-1 text-[13px] text-muted">
                  {e.source ? `${e.source.label} · ` : ''}
                  {e.prompt_text}
                </p>
                <p className="mt-1 line-clamp-2 font-serif text-[16px]">{e.body || '—'}</p>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  {e.tags.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                  {e.follow_ups.length ? <Badge tone="accent">{e.follow_ups.length} follow-up{e.follow_ups.length > 1 ? 's' : ''}</Badge> : null}
                  {e.observation_ids.length ? <Badge tone="accent">Observed</Badge> : null}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title={entries?.length ? 'No matching entries' : 'No entries yet'}>{entries?.length ? 'Try another word or tag.' : 'Today’s subject is waiting in Reflection.'}</Empty>
      )}
    </div>
  )
}
