'use client'

import Link from 'next/link'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Badge, Empty, Input, Label, PageHeader, Select, Textarea } from '@/components/ui/primitives'
import { useApp, useData } from '@/lib/app/context'
import { LEDGER_KINDS, LEDGER_KIND_LABELS, type LedgerKind } from '@/lib/db/types'
import { formatDateTime } from '@/lib/utils'

export function Ledger() {
  const { repo } = useApp()
  const { data: entries } = useData((r) => r.ledger(), [])
  const [kind, setKind] = React.useState<LedgerKind>('observation')
  const [title, setTitle] = React.useState('')
  const [body, setBody] = React.useState('')
  const [tags, setTags] = React.useState('')
  const [filterKind, setFilterKind] = React.useState<LedgerKind | 'all'>('all')
  const [filterTag, setFilterTag] = React.useState<string | null>(null)
  const [showArchived, setShowArchived] = React.useState(false)
  const [q, setQ] = React.useState('')

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!repo || !(title.trim() || body.trim())) return
    await repo.saveLedger({ kind, title: title.trim(), body: body.trim(), tags: tags.split(',').map((t) => t.trim()).filter(Boolean) })
    setTitle('')
    setBody('')
    setTags('')
  }

  const allTags = React.useMemo(() => [...new Set((entries ?? []).flatMap((e) => e.tags))].sort(), [entries])
  const needle = q.trim().toLowerCase()
  const shown = (entries ?? []).filter(
    (e) =>
      (showArchived ? e.archived : !e.archived) &&
      (filterKind === 'all' || e.kind === filterKind) &&
      (!filterTag || e.tags.includes(filterTag)) &&
      (!needle || `${e.title} ${e.body} ${e.tags.join(' ')}`.toLowerCase().includes(needle)),
  )

  return (
    <div>
      <PageHeader eyebrow="Document" title="Ledger">
        Unrestricted observational storage. Anything can be kept here without being analysed; connect it to other material when that becomes useful.
      </PageHeader>

      <div className="grid gap-10 lg:grid-cols-[360px_minmax(0,1fr)]">
        <form onSubmit={add} className="h-fit space-y-3 rounded-[4px] border border-line bg-raised p-5 lg:sticky lg:top-20" aria-label="New ledger entry">
          <p className="eyebrow">New entry</p>
          <div>
            <Label htmlFor="l-kind">Kind</Label>
            <Select id="l-kind" value={kind} onChange={(e) => setKind(e.target.value as LedgerKind)}>
              {LEDGER_KINDS.map((k) => (
                <option key={k} value={k}>
                  {LEDGER_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="l-title">Title (optional)</Label>
            <Input id="l-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="l-body">Entry</Label>
            <Textarea id="l-body" value={body} onChange={(e) => setBody(e.target.value)} className="writing min-h-36 text-[16px]" />
          </div>
          <div>
            <Label htmlFor="l-tags">Tags</Label>
            <Input id="l-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma separated" />
          </div>
          <Button type="submit" disabled={!title.trim() && !body.trim()}>
            Keep
          </Button>
        </form>

        <div>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the Ledger" aria-label="Search the Ledger" className="sm:w-64" />
            <Select aria-label="Filter by kind" value={filterKind} onChange={(e) => setFilterKind(e.target.value as LedgerKind | 'all')} className="sm:w-48">
              <option value="all">All kinds</option>
              {LEDGER_KINDS.map((k) => (
                <option key={k} value={k}>
                  {LEDGER_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Archived
            </label>
          </div>
          {allTags.length ? (
            <div className="mb-5 flex flex-wrap gap-1.5">
              {allTags.map((t) => (
                <button key={t} type="button" onClick={() => setFilterTag(filterTag === t ? null : t)} aria-pressed={filterTag === t} className="cursor-pointer">
                  <Badge tone={filterTag === t ? 'solid' : 'neutral'}>{t}</Badge>
                </button>
              ))}
            </div>
          ) : null}
          {shown.length ? (
            <ul className="space-y-3">
              {shown.map((e) => (
                <li key={e.id}>
                  <Link href={`/ledger/entry/?id=${e.id}`} className="block rounded-[4px] border border-line p-4 hover:bg-surface">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge tone="accent">{LEDGER_KIND_LABELS[e.kind]}</Badge>
                      <span className="text-[12px] text-muted">{formatDateTime(e.created_at)}</span>
                      {e.links.length ? <span className="text-[12px] text-muted">· {e.links.length} link{e.links.length > 1 ? 's' : ''}</span> : null}
                    </div>
                    {e.title ? <p className="font-serif text-[18px]">{e.title}</p> : null}
                    {e.body ? <p className="line-clamp-3 font-serif text-[15px] text-ink-2">{e.body}</p> : null}
                    {e.tags.length ? (
                      <p className="mt-2 flex flex-wrap gap-1">
                        {e.tags.map((t) => (
                          <Badge key={t}>{t}</Badge>
                        ))}
                      </p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title={entries?.length ? 'Nothing matches' : 'The Ledger is empty'}>{entries?.length ? 'Change the filters or search.' : 'Observations, ideas, questions, quotes, dreams — anything worth keeping.'}</Empty>
          )}
        </div>
      </div>
    </div>
  )
}
