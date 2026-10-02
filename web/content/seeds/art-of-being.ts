// The Art of Being, the PCI Companion Articles and the Library sub-chapters.
//
// Texts come from the author's manuscript in content/manuscript/ (via the
// generated manuscript module) — the Author's Voice rewrite of 27–29 September
// 2026 handed over with the PCI website brief (content/handoff/). Chapter
// numbers, titles, subtitles and bodies are the author's. Every text carries
// its own subtitle, which is used as the lede; the SCOPE notes below are the
// blueprint's one-line descriptions and serve only as a fallback where a text
// has none.
//
// Live corpus (01-SITE-BRIEF.md): the twelve core chapters; five companion
// articles (AAA, To Sing Is to Breathe, Being Is Becoming, The Neutral
// Gateway, YOUR “BUSINESS” EVOLVES AROUND OTHERS); and two Library sub-chapters
// filed under chapter 5, Individualism (Other People’s Material; Coherence in
// Business). Slugs match content/site.ts.
//
// Front and back matter (introduction, glossary, appendix, references) have
// not been supplied; they stay registered as drafts, and publication
// validation keeps them out of the Library until complete text is entered.
import type { ContentItem } from '@/lib/content/types'
import { BOOK_CHAPTERS, COMPANION_ARTICLES, LIBRARY_SUBCHAPTERS, type ManuscriptText } from './manuscript.generated.ts'

const AT = '2026-09-29T00:00:00.000Z'
const SOURCE = 'Author manuscript — Shaun, PCI Academy'

/** Blueprint §5.2 scope notes, keyed by manuscript title; a fallback lede only. */
const SCOPE: Record<string, string> = {
  'Discover Your Hidden Abilities': 'Discovery and visibility of capacity before premature identity conclusions.',
  'Practice as a Mythology': 'Repetition, learning, adaptation, and cultural myths surrounding forced practice.',
  'You Were Finished at Birth': 'PCI material concerning completeness, construction, and becoming.',
  'Darkness Is an Opportunity to Shine': 'Shadow material, projection, visibility, and unseen psychological material, with symbolic claims kept epistemically bounded.',
  Individualism: 'Individuality without requiring a permanently fixed true-self ontology.',
  'The Principle of Balance': 'Balance as systemic relationship rather than moral approval.',
  'Identity — The Field of Possibilities': 'Identity as active configuration and field of possibilities rather than permanently finished object.',
  'Growth Is Effortless': 'Organic development contrasted with forced repetition and externally manufactured standards of progress.',
  'You Are Bound to Choose / Perpetual Becoming': 'Choice, participation, and continuing becoming.',
  'The Observer Gets Observed / Judgment as Cognitive Processing': 'Judgment treated as cognitive processing, while the observer itself becomes observable material.',
  'The Illusion of Challenge / Problem Is a Construct / Emotion as Feedback / Emotion Without Possession': 'Distinguishes event from classification, while examining emotion as information without compulsory identity possession.',
  'Repetition Is Not Repetition': 'External repetition may look identical while organism, context, skill, information, perception, and relationship to the act change.',
  'The AAA Method — Adopt, Allow, Align': 'The AAA method: Adopt, Allow, Align.',
  'To Sing Is to Breathe; To Breathe Is to Be': 'Breath, voice, presence, and the embodied field.',
  'Being Is Becoming': 'Being is Manifested; Becoming is Manufactured.',
  'The Neutral Gateway / Neutrality and Subtlety — The Forgotten Power': 'Neutrality as observational space rather than emotional absence; subtlety as a neglected mode of perception.',
}

export function chapterSlug(n: number): string {
  return `chapter-${String(n).padStart(2, '0')}`
}

/** Companion article slugs (content/site.ts ARTICLES): stable, short, and distinct from the framework texts. */
const COMPANION_SLUG: Record<number, string> = {
  1: 'the-aaa-method',
  2: 'to-sing-is-to-breathe',
  3: 'being-is-becoming',
  4: 'the-neutral-gateway',
  5: 'your-business-evolves-around-others',
}

/** Library sub-chapter slugs (content/site.ts SUB_CHAPTERS), keyed by manuscript order. */
const LIBRARY_SLUG: Record<number, string> = {
  1: 'other-peoples-material',
  2: 'coherence-in-business',
}

function fromManuscript(t: ManuscriptText, slug: string, type: ContentItem['type'], collection: ContentItem['collection']): ContentItem {
  const scope = SCOPE[t.title]
  return {
    id: `${collection}:${slug}`,
    slug,
    type,
    collection,
    title: t.title,
    summary: t.subtitle || scope || '',
    scope,
    body: t.body,
    status: 'published',
    canon_status: 'canonical',
    canon_version: t.canon,
    content_version: 1,
    order: t.order,
    source: `${SOURCE} (${t.file})`,
    related: [],
    concepts: [],
    updated_at: AT,
    published_at: AT,
    history: [],
  }
}

const draft = (slug: string, title: string, type: ContentItem['type'], order: number, scope: string): ContentItem => ({
  id: `art-of-being:${slug}`,
  slug,
  type,
  collection: 'art-of-being',
  title,
  summary: scope,
  scope,
  body: '',
  status: 'draft',
  canon_status: 'canonical',
  canon_version: '2026.09.25',
  content_version: 1,
  order,
  source: 'Blueprint §5.2 (registry only — text not supplied)',
  related: [],
  concepts: [],
  updated_at: AT,
  history: [],
})

const last = BOOK_CHAPTERS.length

export const ART_OF_BEING: ContentItem[] = [
  draft('introduction', 'Introduction', 'front_matter', 0, 'Introduction to The Art of Being.'),
  ...BOOK_CHAPTERS.map((t) => fromManuscript(t, chapterSlug(t.order), 'chapter', 'art-of-being')),
  draft('book-glossary', 'Glossary', 'back_matter', last + 1, 'The book’s glossary.'),
  draft('appendix', 'Appendix', 'back_matter', last + 2, 'Appendix.'),
  draft('references', 'References', 'back_matter', last + 3, 'References.'),
]

export const COMPANION: ContentItem[] = COMPANION_ARTICLES.map((t) => {
  const slug = COMPANION_SLUG[t.order]
  if (!slug) throw new Error(`No slug registered for companion article ${t.order} (${t.title})`)
  return fromManuscript(t, slug, 'article', 'companion')
})

/** Library sub-chapters: filed under their parent chapter, read at /library/<slug>/. */
export const LIBRARY: ContentItem[] = LIBRARY_SUBCHAPTERS.map((t) => {
  const slug = LIBRARY_SLUG[t.order]
  if (!slug) throw new Error(`No slug registered for library sub-chapter ${t.order} (${t.title})`)
  if (t.parent_chapter === undefined) throw new Error(`Library sub-chapter ${t.title} has no parent chapter`)
  const parent = chapterSlug(t.parent_chapter)
  return { ...fromManuscript(t, slug, 'sub_chapter', 'library'), parent, related: [parent] }
})

export const ART_OF_BEING_SLUGS = ART_OF_BEING.map((c) => c.slug)
