// Keyword search (§3.7, §14). Results always state whether they are public
// PCI content or the user's private material. Private results come only
// from the signed-in user's own store (RLS-isolated in account mode).
import { stripInline } from '@/lib/content/markdown'
import type { ContentItem, Course, GlossaryTerm } from '@/lib/content/types'
import { hrefFor } from '@/lib/content/catalog'
import type { ContrarySession, JournalEntry, LedgerEntry } from '@/lib/db/types'
import type { ObservationSummary } from '@/lib/db/repository'
import { stem, tokenize } from '@/lib/pci/text'

export type Scope = 'public' | 'private'

export interface SearchDoc {
  id: string
  scope: Scope
  kind: string
  title: string
  text: string
  href: string
  date?: string
}

export interface SearchHit extends SearchDoc {
  score: number
  snippet: string
}

export function publicDocs(content: ContentItem[], glossary: GlossaryTerm[], courses: Course[]): SearchDoc[] {
  return [
    ...content.map((c) => ({ id: `content:${c.slug}`, scope: 'public' as const, kind: c.collection === 'art-of-being' ? 'The Art of Being' : c.collection === 'pci-framework' ? 'PCI Framework' : c.collection === 'companion' ? 'Companion Article' : 'Article', title: c.title, text: stripInline(`${c.summary}\n${c.body}`), href: c.collection === 'articles' ? `/library/view/?slug=${c.slug}` : hrefFor(c) })),
    ...glossary.map((g) => ({ id: `term:${g.slug}`, scope: 'public' as const, kind: 'Glossary', title: g.term, text: g.definition, href: `/library/glossary/#${g.slug}` })),
    ...courses.flatMap((c) => [
      { id: `course:${c.slug}`, scope: 'public' as const, kind: 'Course', title: c.title, text: c.summary, href: `/academy/${c.slug}/` },
      ...c.lessons.map((l) => ({ id: `lesson:${c.slug}/${l.lesson_id}`, scope: 'public' as const, kind: 'Lesson', title: l.title, text: `${l.orientation} ${l.observation} ${l.journal_prompt}`, href: `/academy/${c.slug}/${l.lesson_id}/` })),
    ]),
  ]
}

export function privateDocs(args: { journal: JournalEntry[]; ledger: LedgerEntry[]; observations: ObservationSummary[]; contrary: ContrarySession[] }): SearchDoc[] {
  return [
    ...args.journal.map((j) => ({ id: `journal:${j.id}`, scope: 'private' as const, kind: 'Journal', title: `Journal — ${j.date}`, text: [j.body, ...j.follow_ups.map((f) => f.text), j.tags.join(' ')].join('\n'), href: `/reflection/?date=${j.date}`, date: j.date })),
    ...args.ledger.map((l) => ({ id: `ledger:${l.id}`, scope: 'private' as const, kind: 'Ledger', title: l.title || l.body.slice(0, 60), text: `${l.title}\n${l.body}\n${l.tags.join(' ')}`, href: `/ledger/entry/?id=${l.id}`, date: l.created_at })),
    ...args.observations.map((o) => ({
      id: `obs:${o.input.id}`,
      scope: 'private' as const,
      kind: 'Observation',
      title: o.input.title,
      text: [o.input.raw, ...(o.latest?.report?.what_became_visible.map((v) => v.statement) ?? [])].join('\n'),
      href: `/observe/report/?id=${o.input.id}`,
      date: o.input.created_at,
    })),
    ...args.contrary.map((c) => ({ id: `contrary:${c.id}`, scope: 'private' as const, kind: 'On the Contrary', title: c.title || 'Session', text: Object.values(c.steps).join('\n'), href: `/contrary/session/?id=${c.id}`, date: c.created_at })),
  ]
}

function snippet(text: string, terms: string[]): string {
  const lower = text.toLowerCase()
  let pos = -1
  for (const t of terms) {
    const i = lower.indexOf(t)
    if (i >= 0 && (pos < 0 || i < pos)) pos = i
  }
  const start = Math.max(0, pos - 60)
  const s = text.slice(start, start + 200).replace(/\s+/g, ' ').trim()
  return (start > 0 ? '…' : '') + s + (start + 200 < text.length ? '…' : '')
}

export function search(docs: SearchDoc[], query: string, limit = 40): SearchHit[] {
  const raw = tokenize(query).filter((t) => t.length > 1)
  if (!raw.length) return []
  const terms = raw.map(stem)
  const phrase = query.trim().toLowerCase()
  const hits: SearchHit[] = []
  for (const d of docs) {
    const bodyTokens = tokenize(d.text).map(stem)
    const titleTokens = tokenize(d.title).map(stem)
    let score = 0
    let matched = 0
    for (const t of terms) {
      const inTitle = titleTokens.filter((x) => x.startsWith(t)).length
      const inBody = bodyTokens.filter((x) => x.startsWith(t)).length
      if (inTitle || inBody) matched++
      score += inTitle * 5 + Math.min(inBody, 10)
    }
    if (matched < terms.length) continue
    if (d.text.toLowerCase().includes(phrase) || d.title.toLowerCase().includes(phrase)) score += 8
    hits.push({ ...d, score, snippet: snippet(d.text, raw) })
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit)
}
