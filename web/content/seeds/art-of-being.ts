// The Art of Being (§5.2) and the PCI Companion Articles.
//
// Texts come from the author's manuscript in content/manuscript/ (via the
// generated manuscript module). Chapter numbers, titles and bodies are the
// author's; the scope notes are the blueprint's "Current Chapter Set"
// descriptions and are used as the lede only where a text has no subtitle.
//
// The author's current canon has twelve core chapters. Four titles the
// blueprint listed as chapters (AAA, To Sing Is to Breathe, Being Is Becoming,
// The Neutral Gateway) are published as companion articles instead, so the
// core book can stay stable while those operational models keep developing.
//
// Front and back matter (introduction, glossary, appendix, references) have
// not been supplied; they stay registered as drafts, and publication
// validation keeps them out of the Library until complete text is entered.
import type { ContentItem } from '@/lib/content/types'
import { BOOK_CHAPTERS, COMPANION_ARTICLES, type ManuscriptText } from './manuscript.generated.ts'

const AT = '2026-09-27T00:00:00.000Z'
const SOURCE = 'Author manuscript — Shaun, PCI Academy'

/** Blueprint §5.2 scope notes, keyed by title. */
const SCOPE: Record<string, string> = {
  'Discover Your Hidden Abilities': 'Discovery and visibility of capacity before premature identity conclusions.',
  'Practice as a Mythology': 'Repetition, learning, adaptation, and cultural myths surrounding forced practice.',
  'You Were Finished at Birth': 'PCI material concerning completeness, construction, and becoming.',
  'Darkness Is an Opportunity to Shine': 'Shadow material, Jungian reference, projection, visibility, and unseen psychological material, with symbolic claims kept epistemically bounded.',
  Individualism: 'Individuality without requiring a permanently fixed true-self ontology.',
  'The Principle of Balance': 'Balance as systemic relationship rather than moral approval.',
  'Identity — The Field of Possibilities': 'Identity as active configuration and field of possibilities rather than permanently finished object.',
  'Growth Is Effortless': 'Organic development contrasted with forced repetition and externally manufactured standards of progress; linked to Practice as a Mythology.',
  'You Are Bound to Choose / Perpetual Becoming': 'Choice, participation, and continuing becoming.',
  'The Observer Gets Observed / Judgment as Cognitive Processing': 'Judgment treated as cognitive processing, while the observer itself becomes observable material.',
  'The Illusion of Challenge / Problem Is a Construct / Emotion as Feedback / Emotion Without Possession': 'Distinguishes event from classification, while examining emotion as information without compulsory identity possession.',
  'Repetition Is Not Repetition': 'External repetition may look identical while organism, context, skill, information, perception, and relationship to the act change.',
  'The AAA Method — Adopt, Allow, Align': 'The established AAA method within the current PCI canon.',
  'To Sing Is to Breathe; To Breathe Is to Be': 'Conscious breathing, embodiment, seven embodied plus five higher energy centers within the supplied framework, full-body breathing, full-body voice, performance, presence, self-consciousness, and Being.',
  'Being Is Becoming': 'Centered on the formulation: Being is Manifested; Becoming is Manufactured.',
  'The Neutral Gateway / Neutrality and Subtlety — The Forgotten Power': 'Neutrality as observational space rather than emotional absence; subtlety as a neglected mode of perception.',
}

export function chapterSlug(n: number): string {
  return `chapter-${String(n).padStart(2, '0')}`
}

/** Companion article slugs: stable, short, and distinct from the framework texts. */
const COMPANION_SLUG: Record<number, string> = {
  1: 'the-aaa-method',
  2: 'to-sing-is-to-breathe',
  3: 'being-is-becoming',
  4: 'the-neutral-gateway',
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

export const ART_OF_BEING_SLUGS = ART_OF_BEING.map((c) => c.slug)
