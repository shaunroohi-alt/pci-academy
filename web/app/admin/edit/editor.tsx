'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Badge, Empty, Input, Label, Notice, Select, Tabs, Textarea } from '@/components/ui/primitives'
import { useApp } from '@/lib/app/context'
import { useCms } from '@/lib/app/use-cms'
import { hrefFor } from '@/lib/content/catalog'
import { LIFECYCLE_LABELS, TRANSITIONS } from '@/lib/content/lifecycle'
import { blockText, parseBlocks } from '@/lib/content/markdown'
import type { ContentItem, Lifecycle } from '@/lib/content/types'
import { MIN_BODY_CHARS, validateForPublication } from '@/lib/content/validation'
import { CANON_STATUSES, CANON_STATUS_META, CANON_VERSION, type CanonStatus } from '@/lib/pci/canon'
import { formatDateTime } from '@/lib/utils'

function newArticle(slug: string, title: string): ContentItem {
  const at = new Date().toISOString()
  return {
    id: `articles:${slug}`,
    slug,
    type: 'article',
    collection: 'articles',
    title,
    summary: '',
    body: '',
    status: 'draft',
    canon_status: 'provisional',
    canon_version: CANON_VERSION,
    content_version: 1,
    related: [],
    concepts: [],
    updated_at: at,
    history: [],
  }
}

type Message = { tone: 'accent' | 'danger'; text: string } | null

export function Editor() {
  const params = useSearchParams()
  const router = useRouter()
  const isNew = params.get('new') === '1'
  const slug = params.get('slug') ?? ''
  const { content, refreshContent } = useApp()
  const { cms, allowed } = useCms()
  const [message, setMessage] = React.useState<Message>(null)
  const [title, setTitle] = React.useState('')
  const [newSlug, setNewSlug] = React.useState('')

  if (allowed === false) return <Empty title="Staff access required" />

  if (isNew && !slug) {
    return (
      <form
        className="mx-auto max-w-md space-y-4 py-8"
        onSubmit={async (e) => {
          e.preventDefault()
          const s = newSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          if (!s || content.some((c) => c.slug === s)) return setMessage({ tone: 'danger', text: 'Choose a unique address.' })
          if (!cms) return
          await cms.saveDraft(newArticle(s, title || 'Untitled'), { change_note: 'Created' })
          await refreshContent()
          router.replace(`/admin/edit/?slug=${s}`)
        }}
      >
        <h1 className="display text-[36px]">New article</h1>
        <div>
          <Label htmlFor="n-title">Title</Label>
          <Input id="n-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="n-slug">Address</Label>
          <Input id="n-slug" required value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="on-neutrality" />
        </div>
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        <Button type="submit">Create draft</Button>
      </form>
    )
  }

  const existing = content.find((c) => c.slug === slug)
  if (!existing) return <Empty title="Text not found" action={<Link href="/admin/" className="text-accent">Back</Link>} />
  return <EditorForm key={`${existing.slug}:${existing.content_version}:${existing.status}`} current={existing} message={message} setMessage={setMessage} />
}

function EditorForm({ current, message, setMessage }: { current: ContentItem; message: Message; setMessage: (m: Message) => void }) {
  const { refreshContent } = useApp()
  const { cms } = useCms()
  const [title, setTitle] = React.useState(current.title)
  const [body, setBody] = React.useState(current.body)
  const [canon, setCanon] = React.useState<CanonStatus>(current.canon_status)
  const [note, setNote] = React.useState('')
  const [view, setView] = React.useState<'write' | 'preview' | 'history'>('write')
  // A save or transition remounts this form with the new version, so the
  // fields are locked while one is in flight: nothing typed can be lost.
  const [busy, setBusy] = React.useState(false)

  const draftItem: ContentItem = { ...current, title, body, canon_status: canon }
  const check = validateForPublication(draftItem)
  const dirty = title !== current.title || body !== current.body || canon !== current.canon_status

  const save = async () => {
    if (!cms) return
    setBusy(true)
    try {
      const next = await cms.saveDraft(current, { title, body, canon_status: canon, change_note: note || 'Edited' })
      await refreshContent()
      setMessage({ tone: 'accent', text: `Saved as ${LIFECYCLE_LABELS[next.status].toLowerCase()} (version ${next.content_version}).` })
    } catch (e) {
      setMessage({ tone: 'danger', text: e instanceof Error ? e.message : 'Save failed.' })
    } finally {
      setBusy(false)
    }
  }

  const move = async (to: Lifecycle) => {
    if (!cms) return
    if (dirty) return setMessage({ tone: 'danger', text: 'Save your changes before changing status.' })
    setBusy(true)
    try {
      await cms.transition(current, to)
      await refreshContent()
      setMessage({ tone: 'accent', text: `Moved to ${LIFECYCLE_LABELS[to]}.` })
    } catch (e) {
      setMessage({ tone: 'danger', text: e instanceof Error ? e.message : 'Transition refused.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <fieldset disabled={busy} aria-busy={busy} className="m-0 min-w-0 border-0 p-0">
      <Link href="/admin/" className="text-[13px] text-accent">
        ← Content
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone={current.status === 'published' ? 'solid' : 'neutral'}>{LIFECYCLE_LABELS[current.status]}</Badge>
        <Badge>v{current.content_version}</Badge>
        <span className="text-[12px] text-muted">
          {current.collection} · {current.type}
          {current.scope ? ` · Scope: ${current.scope}` : ''}
        </span>
        {current.status === 'published' ? (
          <Link href={current.collection === 'articles' ? `/library/view/?slug=${current.slug}` : hrefFor(current)} className="ml-auto text-[13px] text-accent">
            View published →
          </Link>
        ) : null}
      </div>

      <Input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="display mt-4 h-auto border-0 bg-transparent px-0 text-[36px]" />

      {message ? <Notice tone={message.tone} className="my-4">{message.text}</Notice> : null}

      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <Tabs
            label="Editor view"
            value={view}
            onChange={setView}
            items={[
              { value: 'write', label: 'Write' },
              { value: 'preview', label: 'Preview' },
              { value: 'history', label: 'Versions', count: current.history.length + 1 },
            ]}
          />
          {view === 'write' ? (
            <>
              <Textarea aria-label="Body" value={body} onChange={(e) => setBody(e.target.value)} className="mt-4 min-h-[60vh] font-mono text-[13px] leading-relaxed" placeholder="## Heading, paragraphs, - lists, > quotes, [[glossary term]]" />
              <p className="mt-1 text-[12px] text-muted">
                {body.trim().length} characters · {parseBlocks(body).length} blocks · minimum {MIN_BODY_CHARS} to publish
              </p>
            </>
          ) : view === 'preview' ? (
            <div className="prose-pci mt-6 max-w-[680px]">
              {parseBlocks(body).map((b, i) => (b.kind === 'h2' ? <h2 key={i}>{b.text}</h2> : b.kind === 'code' ? <pre key={i}>{b.text}</pre> : <p key={i}>{blockText(b)}</p>))}
            </div>
          ) : (
            <ol className="mt-4 space-y-3">
              <li className="rounded-[3px] border border-ink p-3 text-[13px]">
                <span className="font-medium">v{current.content_version} (current)</span> · {LIFECYCLE_LABELS[current.status]} · {formatDateTime(current.updated_at)}
              </li>
              {[...current.history].reverse().map((h) => (
                <li key={h.content_version} className="rounded-[3px] border border-line p-3 text-[13px]">
                  <span className="font-medium">v{h.content_version}</span> · {LIFECYCLE_LABELS[h.status]} · {formatDateTime(h.created_at)} · {h.change_note}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-accent">Text</summary>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[12px] text-ink-2">{h.body}</pre>
                  </details>
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside className="space-y-5">
          <div>
            <Label htmlFor="e-canon">Canon status</Label>
            <Select id="e-canon" value={canon} onChange={(e) => setCanon(e.target.value as CanonStatus)}>
              {CANON_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CANON_STATUS_META[s].label}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[12px] text-muted">{CANON_STATUS_META[canon].meaning}</p>
            {current.canon_status === 'provisional' && canon === 'canonical' ? <Notice tone="danger" className="mt-2">Promotion to canonical needs explicit author approval and a change note.</Notice> : null}
          </div>
          <div>
            <Label htmlFor="e-note">Change note</Label>
            <Input id="e-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed and why" />
          </div>
          <Button onClick={save} disabled={!dirty}>
            Save draft
          </Button>

          <div className="rounded-[3px] border border-line p-4">
            <p className="eyebrow mb-2">Publication check</p>
            {check.ok ? (
              <p className="text-[13px] text-ink-2">Complete. This text can be published once approved.</p>
            ) : (
              <ul className="space-y-1 text-[13px] text-danger">
                {check.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="eyebrow mb-2">Lifecycle</p>
            <div className="flex flex-wrap gap-2">
              {TRANSITIONS[current.status].map((to) => (
                <Button key={to} size="sm" variant={to === 'published' ? 'primary' : 'outline'} onClick={() => move(to)} disabled={to === 'published' && !check.ok}>
                  {to === 'draft' ? 'Return to draft' : `Move to ${LIFECYCLE_LABELS[to]}`}
                </Button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </fieldset>
  )
}
