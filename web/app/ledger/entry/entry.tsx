'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Badge, Empty, Input, Label, Notice, Select, Spinner, Textarea } from '@/components/ui/primitives'
import { useApp, useAutosave, useData } from '@/lib/app/context'
import { hrefFor, published } from '@/lib/content/catalog'
import { LEDGER_KINDS, LEDGER_KIND_LABELS, type LedgerEntry, type LedgerKind, type MaterialLink } from '@/lib/db/types'
import { formatDate, formatDateTime } from '@/lib/utils'

function linkHref(l: MaterialLink): string {
  switch (l.kind) {
    case 'observation':
      return `/observe/report/?id=${l.id}`
    case 'journal':
      return `/journal/?date=${l.id}`
    case 'ledger':
      return `/ledger/entry/?id=${l.id}`
    case 'contrary':
      return `/contrary/session/?id=${l.id}`
    case 'course':
      return `/academy/${l.id}/`
    default:
      return l.id
  }
}

export function LedgerEntryView() {
  const id = useSearchParams().get('id') ?? ''
  const { data: entry, loading } = useData((r) => r.ledgerEntry(id), [id])
  if (loading) return <Spinner label="Opening" />
  if (!entry) return <Empty title="Entry not found" action={<Link href="/ledger/" className="text-accent">Back to the Ledger</Link>} />
  return <LedgerEditor key={entry.id} initial={entry} />
}

function LedgerEditor({ initial }: { initial: LedgerEntry }) {
  const router = useRouter()
  const { repo, content } = useApp()
  const { data: live } = useData((r) => r.ledgerEntry(initial.id), [initial.id])
  const entry = live ?? initial
  const { data: pool } = useData(async (r) => ({ obs: await r.observations(), journal: await r.journalEntries(), ledger: await r.ledger(), contrary: await r.contrarySessions() }), [])
  const [draft, setDraft] = React.useState({ kind: initial.kind, title: initial.title, body: initial.body, tags: initial.tags.join(', ') })
  const [linkKind, setLinkKind] = React.useState<MaterialLink['kind']>('observation')
  const [linkId, setLinkId] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const autosave = useAutosave(() => repo?.saveLedger({ ...entry, kind: draft.kind, title: draft.title, body: draft.body, tags: draft.tags.split(',').map((x) => x.trim()).filter(Boolean) }), 600)

  const change = (patch: Partial<typeof draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    autosave.schedule()
  }

  const options: { id: string; label: string }[] =
    linkKind === 'observation'
      ? (pool?.obs ?? []).map((o) => ({ id: o.input.id, label: o.input.title }))
      : linkKind === 'journal'
        ? (pool?.journal ?? []).map((j) => ({ id: j.id, label: `Journal, ${formatDate(j.date)}` }))
        : linkKind === 'ledger'
          ? (pool?.ledger ?? []).filter((l) => l.id !== entry.id).map((l) => ({ id: l.id, label: l.title || l.body.slice(0, 60) }))
          : linkKind === 'contrary'
            ? (pool?.contrary ?? []).map((c) => ({ id: c.id, label: c.title || 'On the Contrary session' }))
            : published(content).map((c) => ({ id: hrefFor(c), label: c.title }))

  const addLink = async () => {
    if (!repo || !linkId) return
    const opt = options.find((o) => o.id === linkId)
    if (!opt || entry.links.some((l) => l.kind === linkKind && l.id === linkId)) return
    await repo.saveLedger({ ...entry, links: [...entry.links, { kind: linkKind, id: linkId, label: opt.label }] })
    setLinkId('')
  }

  const analyse = async () => {
    if (!repo) return
    setBusy(true)
    setError(null)
    try {
      const { observation } = await repo.analyzeLedger(entry.id)
      router.push(`/observe/report/?id=${observation.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed.')
      setBusy(false)
    }
  }

  const examine = async () => {
    if (!repo) return
    const s = await repo.saveContrary({ title: entry.title || 'From the Ledger', steps: { identified_error: entry.body }, source: { kind: 'ledger', id: entry.id, label: entry.title || 'Ledger entry' } })
    await repo.saveLedger({ ...entry, links: [...entry.links, { kind: 'contrary', id: s.id, label: s.title }] })
    router.push(`/contrary/session/?id=${s.id}`)
  }

  const remove = async () => {
    if (!repo || !window.confirm('Delete this ledger entry?')) return
    await repo.deleteLedger(entry.id)
    router.push('/ledger/')
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/ledger/" className="text-[13px] text-accent">
        ← Ledger
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Select aria-label="Kind" value={draft.kind} onChange={(e) => change({ kind: e.target.value as LedgerKind })} className="w-48">
          {LEDGER_KINDS.map((k) => (
            <option key={k} value={k}>
              {LEDGER_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
        <span className="text-[12px] text-muted">
          Created {formatDateTime(entry.created_at)} · saved {formatDateTime(entry.updated_at)}
        </span>
        {entry.archived ? <Badge>Archived</Badge> : null}
      </div>
      <Input aria-label="Title" value={draft.title} onChange={(e) => change({ title: e.target.value })} placeholder="Title" className="display mt-5 h-auto border-0 bg-transparent px-0 text-[34px]" />
      <Textarea aria-label="Entry" value={draft.body} onChange={(e) => change({ body: e.target.value })} className="writing mt-2 min-h-64 border-0 border-t border-line bg-transparent px-0" />
      <div className="mt-4 max-w-md">
        <Label htmlFor="e-tags">Tags</Label>
        <Input id="e-tags" value={draft.tags} onChange={(e) => change({ tags: e.target.value })} />
      </div>

      {error ? <Notice tone="danger" className="mt-6">{error}</Notice> : null}

      <div className="mt-8 flex flex-wrap gap-2">
        <Button onClick={analyse} disabled={busy || !draft.body.trim()}>
          {busy ? 'Analysing…' : 'Analyse through PCI'}
        </Button>
        <Button variant="outline" onClick={examine} disabled={!draft.body.trim()}>
          Examine On the Contrary
        </Button>
        <Button variant="outline" onClick={() => repo?.saveLedger({ ...entry, archived: !entry.archived })}>
          {entry.archived ? 'Restore from archive' : 'Archive'}
        </Button>
        <Button variant="ghost" className="ml-auto text-danger" onClick={remove}>
          Delete
        </Button>
      </div>

      <section className="mt-12 border-t border-line pt-6" aria-labelledby="links-h">
        <h2 id="links-h" className="display text-[24px]">
          Connections
        </h2>
        <p className="mt-1 text-[13px] text-muted">A connection records that two pieces of material relate. It does not say how.</p>
        {entry.links.length ? (
          <ul className="mt-4 space-y-1.5">
            {entry.links.map((l, i) => (
              <li key={`${l.kind}-${l.id}`} className="flex items-center gap-2 text-[14px]">
                <Badge>{l.kind}</Badge>
                <Link href={linkHref(l)} className="text-accent">
                  {l.label}
                </Link>
                <button type="button" className="ml-auto cursor-pointer text-[12px] text-muted hover:text-danger" onClick={() => repo?.saveLedger({ ...entry, links: entry.links.filter((_, k) => k !== i) })}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Select aria-label="Connect to" value={linkKind} onChange={(e) => { setLinkKind(e.target.value as MaterialLink['kind']); setLinkId('') }} className="sm:w-44">
            <option value="observation">Observation</option>
            <option value="journal">Journal entry</option>
            <option value="ledger">Ledger entry</option>
            <option value="contrary">On the Contrary</option>
            <option value="library">Library text</option>
          </Select>
          <Select aria-label="Item" value={linkId} onChange={(e) => setLinkId(e.target.value)}>
            <option value="">Choose…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
          <Button variant="outline" onClick={addLink} disabled={!linkId}>
            Connect
          </Button>
        </div>
      </section>
    </div>
  )
}
