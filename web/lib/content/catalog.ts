// The corpus: seeded canonical content, overlaid by CMS revisions (local
// workspace or Supabase). Readers see only published, complete items.
import { ART_OF_BEING, COMPANION, LIBRARY } from '@/content/seeds/art-of-being'
import { FRAMEWORK } from '@/content/seeds/framework'
import { GLOSSARY } from '@/content/seeds/glossary'
import type { ContentItem, GlossaryTerm } from './types'
import { isPubliclyVisible } from './validation'

export const SEED_CONTENT: ContentItem[] = [...FRAMEWORK, ...ART_OF_BEING, ...COMPANION, ...LIBRARY]

/** Overlay CMS items onto seeds by slug; the higher content version wins, and CMS-only items are added. */
export function mergeContent(seeds: ContentItem[], overlay: ContentItem[]): ContentItem[] {
  const map = new Map(seeds.map((s) => [s.slug, s]))
  for (const o of overlay) {
    const s = map.get(o.slug)
    if (!s) map.set(o.slug, o)
    else if (o.content_version >= s.content_version) {
      // Remote rows carry text and status; keep the seed's editorial metadata where the overlay has none.
      map.set(o.slug, {
        ...s,
        ...o,
        summary: o.summary || s.summary,
        related: o.related.length ? o.related : s.related,
        concepts: o.concepts.length ? o.concepts : s.concepts,
        source: o.source ?? s.source,
        scope: o.scope ?? s.scope,
      })
    }
  }
  return [...map.values()]
}

/**
 * What a reader sees: the item if it is published and complete; otherwise,
 * while a revision is in progress, the last published version from history.
 */
export function readable(item: ContentItem): ContentItem | undefined {
  if (isPubliclyVisible(item)) return item
  const last = [...item.history].reverse().find((h) => h.status === 'revised')
  if (!last) return undefined
  const prior: ContentItem = { ...item, title: last.title, body: last.body, canon_status: last.canon_status, canon_version: last.canon_version, content_version: last.content_version, status: 'published' }
  return isPubliclyVisible(prior) ? prior : undefined
}

export function published(items: ContentItem[]): ContentItem[] {
  return items
    .map(readable)
    .filter((x): x is ContentItem => Boolean(x))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
}

export function bySlug(items: ContentItem[], slug: string): ContentItem | undefined {
  return items.find((i) => i.slug === slug)
}

export function hrefFor(item: Pick<ContentItem, 'slug' | 'collection'>): string {
  if (item.collection === 'art-of-being') return `/library/art-of-being/${item.slug}/`
  return `/library/${item.slug}/`
}

export const GLOSSARY_TERMS: GlossaryTerm[] = [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term))
export const TERM_BY_SLUG = new Map(GLOSSARY.map((t) => [t.slug, t]))

/** Neighbouring published items within a collection, for previous / next. */
export function neighbours(items: ContentItem[], slug: string) {
  const i = items.findIndex((x) => x.slug === slug)
  return { prev: i > 0 ? items[i - 1] : undefined, next: i >= 0 && i < items.length - 1 ? items[i + 1] : undefined }
}
