'use client'

import { Bookmark, BookmarkCheck, Expand, Headphones, Highlighter, Minus, NotebookPen, Pause, Play, Plus, Shrink, Square, Trash2 } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Badge, Notice, Textarea } from '@/components/ui/primitives'
import { useApp, useData } from '@/lib/app/context'
import { resolveNarration } from '@/lib/audio/narration'
import { speak, speechAvailable } from '@/lib/audio/speech'
import { hrefFor, neighbours, published, readable, TERM_BY_SLUG } from '@/lib/content/catalog'
import { blockText, parseBlocks, parseInline, type Block, type Inline } from '@/lib/content/markdown'
import type { ContentItem } from '@/lib/content/types'
import type { SpeechHandle } from '@/lib/ai/provider'
import type { Highlight, Note } from '@/lib/db/types'
import { CANON_STATUS_META } from '@/lib/pci/canon'
import { cn, formatDate } from '@/lib/utils'

function Term({ inline }: { inline: Extract<Inline, { kind: 'term' }> }) {
  const [open, setOpen] = React.useState(false)
  const term = TERM_BY_SLUG.get(inline.slug)
  if (!term) return <>{inline.text}</>
  return (
    <span className="relative">
      <button type="button" className="term-link cursor-help" aria-expanded={open} onClick={() => setOpen(!open)} onBlur={() => setTimeout(() => setOpen(false), 150)}>
        {inline.text}
      </button>
      {open ? (
        <span role="tooltip" className="absolute left-0 top-full z-30 mt-1 block w-72 rounded-[4px] border border-line bg-raised p-3 font-sans text-[13px] leading-snug text-ink shadow-lg">
          <span className="mb-1 block font-semibold">{term.term}</span>
          {term.definition}
          <Link href={`/library/glossary/#${term.slug}`} className="mt-2 block text-[12px] font-medium text-accent">
            Glossary →
          </Link>
        </span>
      ) : null}
    </span>
  )
}

function renderInline(text: string, marks: string[], keyPrefix: string): React.ReactNode[] {
  return parseInline(text).map((part, i) => {
    const key = `${keyPrefix}-${i}`
    if (part.kind === 'term') return <Term key={key} inline={part} />
    if (part.kind === 'link')
      return (
        <Link key={key} href={part.href} className="text-accent underline underline-offset-2">
          {part.text}
        </Link>
      )
    const content = markText(part.text, marks, key)
    if (part.kind === 'strong') return <strong key={key}>{content}</strong>
    if (part.kind === 'em') return <em key={key}>{content}</em>
    return <React.Fragment key={key}>{content}</React.Fragment>
  })
}

function markText(text: string, marks: string[], key: string): React.ReactNode {
  const found = marks.filter((m) => m && text.includes(m))
  if (!found.length) return text
  const re = new RegExp(`(${found.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
  return text.split(re).map((seg, i) => (found.includes(seg) ? <mark key={`${key}-m${i}`}>{seg}</mark> : seg))
}

function BlockView({ block, marks, index }: { block: Block; marks: string[]; index: number }) {
  const k = `b${index}`
  switch (block.kind) {
    case 'h2':
      return <h2>{renderInline(block.text, marks, k)}</h2>
    case 'h3':
      return <h3>{renderInline(block.text, marks, k)}</h3>
    case 'quote':
      return <blockquote>{renderInline(block.text, marks, k)}</blockquote>
    case 'code':
      return <pre>{block.text}</pre>
    case 'ul':
      return (
        <ul>
          {block.items.map((it, i) => (
            <li key={i}>{renderInline(it, marks, `${k}-${i}`)}</li>
          ))}
        </ul>
      )
    case 'ol':
      return (
        <ol>
          {block.items.map((it, i) => (
            <li key={i}>{renderInline(it, marks, `${k}-${i}`)}</li>
          ))}
        </ol>
      )
    default:
      return <p>{renderInline(block.text, marks, k)}</p>
  }
}

export function Reader({ slug, collection }: { slug: string; collection: ContentItem['collection'] }) {
  const { content, repo, prefs, setPrefs, ready } = useApp()
  const raw = content.find((c) => c.slug === slug)
  const item = raw ? readable(raw) : undefined
  const siblings = React.useMemo(() => published(content).filter((c) => c.collection === collection), [content, collection])
  const { prev, next } = neighbours(siblings, slug)
  const blocks = React.useMemo(() => (item ? parseBlocks(item.body) : []), [item])
  const href = item ? hrefFor(item) : ''

  const { data: marksData } = useData(async (r) => ({ highlights: await r.highlights(slug), notes: await r.notes(slug), bookmarks: await r.bookmarks(slug), position: await r.readingPosition(slug) }), [slug])
  const highlights = marksData?.highlights ?? []
  const notes = marksData?.notes ?? []
  const bookmarks = marksData?.bookmarks ?? []

  const [activeBlock, setActiveBlock] = React.useState(0)
  const [listening, setListening] = React.useState<'idle' | 'playing' | 'paused'>('idle')
  const [speakingBlock, setSpeakingBlock] = React.useState<number | null>(null)
  const [selection, setSelection] = React.useState<{ block: number; text: string; x: number; y: number } | null>(null)
  const [noteFor, setNoteFor] = React.useState<number | null>(null)
  const [noteText, setNoteText] = React.useState('')
  const [fullscreen, setFullscreen] = React.useState(false)
  const [resumeDismissed, setResumeDismissed] = React.useState(false)
  const handle = React.useRef<SpeechHandle | null>(null)
  const container = React.useRef<HTMLDivElement>(null)

  // Track the reading position.
  React.useEffect(() => {
    if (!item || !repo) return
    const els = container.current?.querySelectorAll<HTMLElement>('[data-block]')
    if (!els?.length) return
    let t: ReturnType<typeof setTimeout>
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).map((e) => Number((e.target as HTMLElement).dataset.block))
        if (!visible.length) return
        const top = Math.min(...visible)
        setActiveBlock(top)
        clearTimeout(t)
        t = setTimeout(() => {
          void repo.setReadingPosition({ id: slug, content_title: item.title, href, block: top, progress: Math.min(1, (top + 1) / blocks.length) })
        }, 800)
      },
      { rootMargin: '-10% 0px -60% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => {
      io.disconnect()
      clearTimeout(t)
    }
  }, [item, repo, slug, href, blocks.length])

  // Stop narration when leaving.
  React.useEffect(() => () => handle.current?.stop(), [])

  React.useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  if (!ready) return null
  if (!item) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="eyebrow mb-3">{raw ? `${CANON_STATUS_META[raw.canon_status].label} · ${raw.status}` : 'Library'}</p>
        <h1 className="display text-[36px]">{raw ? raw.title : 'Not found'}</h1>
        <p className="mt-4 text-ink-2">
          {raw
            ? 'This text is not published. The Library shows only complete, approved material; a title without its full text is not shown as if it were a chapter.'
            : 'There is no published text at this address.'}
        </p>
        <Link href="/library/" className="mt-6 inline-block font-medium text-accent">
          Back to the Library
        </Link>
      </div>
    )
  }

  const narration = resolveNarration({ id: item.id, content_version: item.content_version }, [], speechAvailable())

  const listen = (from = activeBlock) => {
    handle.current?.stop()
    handle.current = speak(blocks.map(blockText), {
      rate: prefs.audio_rate,
      voice: prefs.audio_voice || undefined,
      startAt: from,
      onBlock: (i) => {
        setSpeakingBlock(i)
        document.getElementById(`b-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        if (repo) void repo.setReadingPosition({ id: slug, content_title: item.title, href, block: i, progress: (i + 1) / blocks.length })
      },
    })
    setListening('playing')
    void handle.current.done.then(() => {
      setListening('idle')
      setSpeakingBlock(null)
    })
  }

  const onMouseUp = () => {
    const sel = window.getSelection()
    const text = sel?.toString().trim() ?? ''
    if (!text || text.length < 3 || !sel?.rangeCount) return setSelection(null)
    const el = (sel.anchorNode?.parentElement as HTMLElement | null)?.closest<HTMLElement>('[data-block]')
    if (!el) return setSelection(null)
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    setSelection({ block: Number(el.dataset.block), text: text.slice(0, 500), x: rect.left + rect.width / 2, y: rect.top })
  }

  const addHighlight = async () => {
    if (!repo || !selection) return
    await repo.addHighlight({ content_slug: slug, content_version: item.content_version, block: selection.block, text: selection.text })
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }

  const saveNote = async (block: number, existing?: Note) => {
    if (!repo || !noteText.trim()) return
    await repo.saveNote({ id: existing?.id, content_slug: slug, block, text: noteText.trim() })
    setNoteFor(null)
    setNoteText('')
  }

  const toggleBookmark = async (block: number) => {
    if (!repo) return
    await repo.toggleBookmark({ content_slug: slug, content_title: item.title, href, block, excerpt: blockText(blocks[block]).slice(0, 140) })
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen?.()
  }

  const highlightsFor = (b: number) => highlights.filter((h: Highlight) => h.block === b)

  return (
    <article className="relative">
      <div className="no-print sticky top-14 z-30 -mx-4 mb-8 flex items-center gap-1 overflow-x-auto border-b border-line bg-bg px-4 py-2 sm:-mx-6 sm:px-6">
        <div role="group" aria-label="Read or listen" className="mr-2 inline-flex rounded-[3px] border border-line">
          <button type="button" aria-pressed={listening === 'idle'} onClick={() => { handle.current?.stop(); setListening('idle') }} className={cn('cursor-pointer px-3 py-1 text-[12px] font-medium', listening === 'idle' ? 'bg-ink text-bg' : 'text-muted')}>
            Read
          </button>
          <button type="button" aria-pressed={listening !== 'idle'} disabled={narration.kind === 'none'} onClick={() => listen()} className={cn('inline-flex cursor-pointer items-center gap-1 px-3 py-1 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-40', listening !== 'idle' ? 'bg-ink text-bg' : 'text-muted')}>
            <Headphones className="h-3.5 w-3.5" aria-hidden /> Listen
          </button>
        </div>
        {listening !== 'idle' ? (
          <>
            {listening === 'playing' ? (
              <Button variant="ghost" size="icon" aria-label="Pause" onClick={() => { handle.current?.pause(); setListening('paused') }}>
                <Pause className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="ghost" size="icon" aria-label="Resume" onClick={() => { handle.current?.resume(); setListening('playing') }}>
                <Play className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" aria-label="Stop" onClick={() => { handle.current?.stop(); setListening('idle') }}>
              <Square className="h-4 w-4" />
            </Button>
            <label className="ml-1 flex items-center gap-1 text-[12px] text-muted">
              Speed
              <select value={prefs.audio_rate} onChange={(e) => { void setPrefs({ audio_rate: Number(e.target.value) }); if (listening === 'playing') setTimeout(() => listen(speakingBlock ?? activeBlock), 50) }} className="rounded border border-line bg-transparent px-1 py-0.5">
                {[0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
                  <option key={r} value={r}>
                    {r}×
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <span className="ml-auto" />
        <Button variant="ghost" size="icon" aria-label="Smaller text" onClick={() => setPrefs({ reader_size: Math.max(16, prefs.reader_size - 1) })}>
          <Minus className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Larger text" onClick={() => setPrefs({ reader_size: Math.min(24, prefs.reader_size + 1) })}>
          <Plus className="h-4 w-4" />
        </Button>
        <select aria-label="Appearance" value={prefs.appearance} onChange={(e) => setPrefs({ appearance: e.target.value as typeof prefs.appearance })} className="h-8 rounded-[3px] border border-line bg-transparent px-1.5 text-[12px]">
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="paper">Warm paper</option>
        </select>
        <Button variant="ghost" size="icon" aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} onClick={toggleFullscreen}>
          {fullscreen ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
        </Button>
      </div>

      {narration.kind === 'device' && listening !== 'idle' ? (
        <p className="no-print -mt-5 mb-6 text-[12px] text-muted">Device voice, reading the current text version. Recorded narration is not yet available for this text.</p>
      ) : null}

      <header className="mx-auto mb-10 max-w-[680px]">
        <p className="eyebrow mb-3">
          {collection === 'art-of-being' ? (item.type === 'chapter' ? `The Art of Being · Chapter ${item.order}` : 'The Art of Being') : 'PCI Framework'}
        </p>
        <h1 className="display text-[40px] sm:text-[52px]">{item.title}</h1>
        {item.summary ? <p className="mt-4 font-serif text-[19px] italic leading-relaxed text-ink-2">{item.summary}</p> : null}
        {!resumeDismissed && marksData?.position && marksData.position.block > 1 ? (
          <button
            type="button"
            className="mt-5 cursor-pointer text-[13px] font-medium text-accent"
            onClick={() => {
              document.getElementById(`b-${marksData.position!.block}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              setResumeDismissed(true)
            }}
          >
            Continue where you left off →
          </button>
        ) : null}
      </header>

      <div ref={container} className="prose-pci mx-auto max-w-[680px]" onMouseUp={onMouseUp} onTouchEnd={() => setTimeout(onMouseUp, 50)}>
        {blocks.map((b, i) => {
          const marked = bookmarks.some((bm) => bm.block === i)
          const blockNotes = notes.filter((n) => n.block === i)
          return (
            <div key={i} id={`b-${i}`} data-block={i} className={cn('group relative scroll-mt-32', speakingBlock === i && 'rounded-[2px] bg-accent-soft')}>
              <div className="no-print absolute -left-11 top-1 hidden flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 md:flex">
                <button type="button" aria-label={marked ? 'Remove bookmark' : 'Bookmark this passage'} onClick={() => toggleBookmark(i)} className="cursor-pointer p-1 text-muted hover:text-ink">
                  {marked ? <BookmarkCheck className="h-4 w-4 text-accent" /> : <Bookmark className="h-4 w-4" />}
                </button>
                <button type="button" aria-label="Add a note" onClick={() => { setNoteFor(i); setNoteText('') }} className="cursor-pointer p-1 text-muted hover:text-ink">
                  <NotebookPen className="h-4 w-4" />
                </button>
                {narration.kind !== 'none' ? (
                  <button type="button" aria-label="Listen from here" onClick={() => listen(i)} className="cursor-pointer p-1 text-muted hover:text-ink">
                    <Headphones className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              {marked ? <BookmarkCheck className="absolute -right-7 top-1.5 hidden h-4 w-4 text-accent md:block" aria-label="Bookmarked" /> : null}
              <BlockView block={b} index={i} marks={highlightsFor(i).map((h) => h.text)} />
              {blockNotes.map((n) => (
                <aside key={n.id} className="mb-5 -mt-2 border-l-2 border-accent bg-surface px-3 py-2 font-sans text-[13.5px] leading-snug text-ink-2">
                  <span className="mb-0.5 flex items-center justify-between text-[11px] text-muted">
                    Your note
                    <button type="button" aria-label="Delete note" onClick={() => repo?.deleteNote(n.id)} className="cursor-pointer p-0.5 hover:text-danger">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  {n.text}
                </aside>
              ))}
              {noteFor === i ? (
                <div className="no-print mb-6 font-sans">
                  <Textarea autoFocus aria-label="Note" value={noteText} onChange={(e) => setNoteText(e.target.value)} className="min-h-20 text-[14px]" />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => saveNote(i)} disabled={!noteText.trim()}>
                      Save note
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setNoteFor(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      {selection ? (
        <div className="no-print fixed z-50 -translate-x-1/2 -translate-y-full rounded-[3px] border border-line bg-ink p-1 shadow-lg" style={{ left: selection.x, top: selection.y - 8 }}>
          <button type="button" onClick={addHighlight} className="inline-flex cursor-pointer items-center gap-1 px-2 py-1 text-[12px] font-medium text-bg">
            <Highlighter className="h-3.5 w-3.5" aria-hidden /> Highlight
          </button>
          <button type="button" onClick={() => { setNoteFor(selection.block); setNoteText(`“${selection.text}” — `); setSelection(null) }} className="inline-flex cursor-pointer items-center gap-1 px-2 py-1 text-[12px] font-medium text-bg">
            <NotebookPen className="h-3.5 w-3.5" aria-hidden /> Note
          </button>
        </div>
      ) : null}

      {highlights.length ? (
        <section className="no-print mx-auto mt-12 max-w-[680px] border-t border-line pt-6">
          <p className="eyebrow mb-3">Your highlights · {highlights.length}</p>
          <ul className="space-y-2">
            {highlights.map((h) => (
              <li key={h.id} className="flex items-start gap-2 text-[14px]">
                <a href={`#b-${h.block}`} className="flex-1 font-serif hover:text-accent">
                  “{h.text}”
                </a>
                {h.content_version !== item.content_version ? <Badge>Earlier version</Badge> : null}
                <button type="button" aria-label="Remove highlight" onClick={() => repo?.deleteHighlight(h.id)} className="cursor-pointer p-0.5 text-muted hover:text-danger">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="mx-auto mt-14 max-w-[680px] border-t border-line pt-6">
        {item.concepts.length ? (
          <div className="mb-6">
            <p className="eyebrow mb-2">Concepts</p>
            <div className="flex flex-wrap gap-1.5">
              {item.concepts.map((c) => {
                const t = TERM_BY_SLUG.get(c)
                return t ? (
                  <Link key={c} href={`/library/glossary/#${c}`}>
                    <Badge>{t.term}</Badge>
                  </Link>
                ) : null
              })}
            </div>
          </div>
        ) : null}
        {item.related.length ? (
          <div className="mb-6">
            <p className="eyebrow mb-2">Related reading</p>
            <ul className="space-y-1 text-[14px]">
              {item.related.map((r) => {
                const rel = siblings.find((s) => s.slug === r) ?? published(content).find((s) => s.slug === r)
                return rel ? (
                  <li key={r}>
                    <Link href={hrefFor(rel)} className="text-accent">
                      {rel.title}
                    </Link>
                  </li>
                ) : null
              })}
            </ul>
          </div>
        ) : null}
        <nav aria-label="Previous and next" className="no-print mb-6 grid grid-cols-2 gap-4">
          {prev ? (
            <Link href={hrefFor(prev)} className="rounded-[3px] border border-line p-3 hover:bg-surface">
              <span className="eyebrow">Previous</span>
              <span className="mt-1 block font-serif text-[15px]">{prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={hrefFor(next)} className="rounded-[3px] border border-line p-3 text-right hover:bg-surface">
              <span className="eyebrow">Next</span>
              <span className="mt-1 block font-serif text-[15px]">{next.title}</span>
            </Link>
          ) : null}
        </nav>
        <p className="text-[12px] text-muted">
          {CANON_STATUS_META[item.canon_status].label} · canon {item.canon_version} · content version {item.content_version} · updated {formatDate(item.updated_at)}
          {item.source ? ` · ${item.source}` : ''}
        </p>
        {raw && raw.status !== 'published' ? <Notice className="mt-3">A revision of this text is in preparation. You are reading the current published version.</Notice> : null}
      </footer>
    </article>
  )
}
