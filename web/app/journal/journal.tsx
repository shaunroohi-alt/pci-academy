'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'
import { Button, LinkButton } from '@/components/ui/button'
import { AskQuestions } from '@/components/pci/ask-questions'
import { Badge, Input, Label, Notice, Spinner, Textarea } from '@/components/ui/primitives'
import { useApp, useAutosave, useData } from '@/lib/app/context'
import { relatedTo } from '@/lib/relational/related'
import type { JournalEntry } from '@/lib/db/types'
import { formatDate, formatDateTime, shiftDate, today } from '@/lib/utils'

export function Journal() {
  const params = useSearchParams()
  const date = params.get('date') ?? today()
  const { data: entry, loading } = useData((r) => r.journalEntry(date), [date])
  if (loading) return null
  // Keyed by date: switching days starts a fresh editor initialised from that day's entry.
  return <JournalEditor key={date} date={date} initial={entry} />
}

function JournalEditor({ date, initial }: { date: string; initial: JournalEntry | undefined }) {
  const router = useRouter()
  const isToday = date === today()
  const { repo, prefs } = useApp()
  const { data: live } = useData((r) => r.journalEntry(date), [date])
  const entry = live ?? initial
  const { data: all } = useData((r) => r.journalEntries(), [])
  const [body, setBody] = React.useState(initial?.body ?? '')
  const [tags, setTags] = React.useState(initial?.tags.join(', ') ?? '')
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'saved'>('idle')
  const [followUp, setFollowUp] = React.useState('')
  const [analysing, setAnalysing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [showHistory, setShowHistory] = React.useState(false)
  const tagList = (t: string) => t.split(',').map((x) => x.trim()).filter(Boolean)

  // No prompt is assigned. The fields stay in the record, empty; an entry
  // written before this edition keeps the prompt text it was written under.
  const promptFields = { prompt_id: entry?.prompt_id ?? '', prompt_text: entry?.prompt_text ?? '' }

  // Autosave after a pause in typing; flushed if the page is left sooner.
  const autosave = useAutosave(async () => {
    if (!repo) return
    await repo.saveJournal({ date, ...promptFields, body, tags: tagList(tags) })
    setSaveState('saved')
  })

  const edit = (next: { body?: string; tags?: string }) => {
    if (next.body !== undefined) setBody(next.body)
    if (next.tags !== undefined) setTags(next.tags)
    setSaveState('saving')
    autosave.schedule()
  }

  const go = (d: string) => router.push(`/journal/?date=${d}`)

  const analyse = async () => {
    if (!repo) return
    setAnalysing(true)
    setError(null)
    try {
      await repo.saveJournal({ date, ...promptFields, body, tags: tagList(tags) })
      const { observation } = await repo.analyzeJournal(date)
      router.push(`/observe/report/?id=${observation.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed.')
      setAnalysing(false)
    }
  }

  const addFollowUp = async () => {
    if (!repo || !followUp.trim()) return
    await repo.addFollowUp(date, followUp)
    setFollowUp('')
  }

  const remove = async () => {
    if (!repo || !entry) return
    if (!window.confirm('Delete this journal entry, its history and follow-ups?')) return
    await repo.deleteJournal(date)
    setBody('')
    setTags('')
    setSaveState('idle')
  }

  const related = React.useMemo(() => {
    if (!prefs.longitudinal || !all || !body.trim()) return []
    return relatedTo(
      { id: date, text: body },
      all.filter((e) => !e.source).map((e) => ({ id: e.id, text: e.body, date: e.date, title: formatDate(e.date), href: `/journal/?date=${e.date}` })),
    )
  }, [prefs.longitudinal, all, body, date])

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => go(shiftDate(date, -1))} aria-label="Previous day">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <input
            type="date"
            aria-label="Journal date"
            value={date}
            max={today()}
            onChange={(e) => e.target.value && go(e.target.value)}
            className="h-9 rounded-[3px] border border-line bg-transparent px-2 text-[13px]"
          />
          <Button variant="ghost" size="icon" onClick={() => go(shiftDate(date, 1))} disabled={isToday} aria-label="Next day">
            <ChevronRight className="h-5 w-5" />
          </Button>
          {!isToday ? (
            <Button variant="link" size="sm" onClick={() => go(today())} className="ml-2">
              Today
            </Button>
          ) : null}
        </div>
        <LinkButton href="/journal/archive/" variant="outline" size="sm">
          Archive
        </LinkButton>
      </div>

      <p className="eyebrow mb-3">Journal · private</p>
      <h1 className="display text-[32px] leading-tight sm:text-[40px]">{formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h1>
      {entry?.prompt_text ? <p className="mt-2 text-[13px] text-muted">Written under an earlier edition’s subject: {entry.prompt_text}</p> : null}

      <div className="mt-8">
        <label htmlFor="journal-body" className="sr-only">
          Journal entry
        </label>
        <Textarea
          id="journal-body"
          value={body}
          onChange={(e) => edit({ body: e.target.value })}
          placeholder="Private. Saved on this device as you write."
          className="writing min-h-80 border-0 border-t border-line bg-transparent px-0 focus-visible:border-t-accent"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-[12px] text-muted">
          <span role="status">{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : entry ? `Last saved ${formatDateTime(entry.updated_at)}` : 'Private entry'}</span>
          <span>{body.trim() ? body.trim().split(/\s+/).length : 0} words</span>
        </div>
      </div>

      {body.trim() ? <AskQuestions material={body} className="mt-6" /> : null}

      <div className="mt-6 max-w-md">
        <Label htmlFor="journal-tags">Tags</Label>
        <Input id="journal-tags" value={tags} onChange={(e) => edit({ tags: e.target.value })} placeholder="work, family, rehearsal" />
      </div>

      {error ? (
        <Notice tone="danger" className="mt-6">
          {error}
        </Notice>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button onClick={analyse} disabled={!body.trim() || analysing}>
          {analysing ? 'Analysing…' : 'Analyse through PCI'}
        </Button>
        {analysing ? <Spinner label="Observing" /> : null}
        {entry ? (
          <Button variant="ghost" size="sm" onClick={remove} className="ml-auto text-danger">
            Delete entry
          </Button>
        ) : null}
      </div>

      {entry?.observation_ids.length ? (
        <div className="mt-6">
          <p className="eyebrow mb-2">Observations of this entry</p>
          <ul className="space-y-1 text-[14px]">
            {entry.observation_ids.map((id, i) => (
              <li key={id}>
                <Link href={`/observe/report/?id=${id}`} className="text-accent">
                  Observation {i + 1}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {entry ? (
        <section className="mt-12 border-t border-line pt-6" aria-labelledby="followup-h">
          <h2 id="followup-h" className="display text-[24px]">
            Follow-up observations
          </h2>
          <p className="mt-1 text-[13px] text-muted">Added later, kept separately from the original entry.</p>
          {entry.follow_ups.length ? (
            <ul className="mt-4 space-y-4">
              {entry.follow_ups.map((f) => (
                <li key={f.id} className="border-l-2 border-brass pl-3">
                  <p className="text-[12px] text-muted">{formatDateTime(f.at)}</p>
                  <p className="font-serif text-[16px]">{f.text}</p>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-4">
            <Label htmlFor="followup">Add a follow-up</Label>
            <Textarea id="followup" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="min-h-20 text-[15px]" />
            <Button size="sm" variant="outline" className="mt-2" onClick={addFollowUp} disabled={!followUp.trim()}>
              Add follow-up
            </Button>
          </div>
        </section>
      ) : null}

      {entry?.revisions.length ? (
        <section className="mt-10 border-t border-line pt-6">
          <button type="button" className="cursor-pointer text-[13px] font-medium text-accent" onClick={() => setShowHistory(!showHistory)} aria-expanded={showHistory}>
            Edit history · {entry.revisions.length} earlier version{entry.revisions.length > 1 ? 's' : ''}
          </button>
          {showHistory ? (
            <ol className="mt-4 space-y-4">
              {[...entry.revisions].reverse().map((r) => (
                <li key={r.at} className="rounded-[3px] border border-line p-4">
                  <p className="mb-1 text-[12px] text-muted">{formatDateTime(r.at)}</p>
                  <p className="whitespace-pre-wrap font-serif text-[15px] text-ink-2">{r.body}</p>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}

      <section className="mt-10 border-t border-line pt-6" aria-labelledby="related-h">
        <h2 id="related-h" className="display text-[24px]">
          Related entries
        </h2>
        {!prefs.longitudinal ? (
          <p className="mt-2 text-[14px] text-muted">
            Related-entry detection reads your earlier entries, so it is off until you allow comparison with earlier material in <Link href="/account/" className="text-accent">Account</Link>.
          </p>
        ) : related.length ? (
          <ul className="mt-3 space-y-2">
            {related.map((r) => (
              <li key={r.item.id} className="flex flex-wrap items-baseline gap-2 text-[14px]">
                <Link href={r.item.href} className="font-medium text-accent">
                  {r.item.title}
                </Link>
                <span className="text-muted">shares {r.shared.map((s) => `“${s}”`).join(', ')}</span>
                {r.similarity >= 0.35 ? <Badge>Close</Badge> : null}
              </li>
            ))}
            <li className="pt-1 text-[12px] text-muted">Relatedness is word overlap. It is a place to look, not a finding.</li>
          </ul>
        ) : (
          <p className="mt-2 text-[14px] text-muted">No earlier entry shares enough wording with this one.</p>
        )}
      </section>
    </div>
  )
}
