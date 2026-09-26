// The Art of Being — chapter registry (§5.2).
//
// Titles, order and scope are canonical: they come from the blueprint's
// "Current Chapter Set". The chapter texts themselves are the author's
// manuscript and are NOT in this repository. Every entry is therefore a
// draft with an empty body, and publication validation keeps it out of the
// Library until the complete, approved text is entered through /admin.
import type { ContentItem } from '@/lib/content/types'

const CANON = '2026.09.25'
const AT = '2026-09-25T00:00:00.000Z'

const CHAPTERS: [number, string, string][] = [
  [1, 'Discover Your Hidden Abilities', 'Discovery and visibility of capacity before premature identity conclusions.'],
  [2, 'The AAA Method — Adopt, Allow, Align', 'The established AAA method within the current PCI canon.'],
  [3, 'Being Is Becoming', 'Centered on the formulation: Being is Manifested; Becoming is Manufactured.'],
  [4, 'Practice as a Mythology', 'Repetition, learning, adaptation, and cultural myths surrounding forced practice.'],
  [5, 'You Were Finished at Birth', 'PCI material concerning completeness, construction, and becoming.'],
  [6, 'Darkness Is an Opportunity to Shine', 'Shadow material, Jungian reference, projection, visibility, and unseen psychological material, with symbolic claims kept epistemically bounded.'],
  [7, 'Individualism — The Courage to Claim Who You Are', 'Individuality without requiring a permanently fixed true-self ontology.'],
  [8, 'The Principle of Balance', 'Balance as systemic relationship rather than moral approval.'],
  [9, 'Identity — The Field of Possibilities', 'Identity as active configuration and field of possibilities rather than permanently finished object.'],
  [10, 'Growth Is Effortless', 'Organic development contrasted with forced repetition and externally manufactured standards of progress; linked to Practice as a Mythology.'],
  [11, 'You Are Bound to Choose / Perpetual Becoming', 'Choice, participation, and continuing becoming.'],
  [12, 'The Neutral Gateway / Neutrality and Subtlety — The Forgotten Power', 'Neutrality as observational space rather than emotional absence; subtlety as a neglected mode of perception.'],
  [13, 'The Observer Gets Observed / Judgment as Cognitive Processing', 'Judgment treated as cognitive processing, while the observer itself becomes observable material.'],
  [14, 'The Illusion of Challenge / Problem Is a Construct / Emotion as Feedback / Emotion Without Possession', 'Distinguishes event from classification, while examining emotion as information without compulsory identity possession.'],
  [15, 'Repetition Is Not Repetition', 'External repetition may look identical while organism, context, skill, information, perception, and relationship to the act change.'],
  [16, 'To Sing Is to Breathe; To Breathe Is to Be', 'Conscious breathing, embodiment, seven embodied plus five higher energy centers within the supplied framework, full-body breathing, full-body voice, performance, presence, self-consciousness, and Being.'],
]

export function chapterSlug(n: number): string {
  return `chapter-${String(n).padStart(2, '0')}`
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
  canon_version: CANON,
  content_version: 1,
  order,
  source: 'Blueprint §5.2 (registry only — manuscript not supplied)',
  related: [],
  concepts: [],
  updated_at: AT,
  history: [],
})

export const ART_OF_BEING: ContentItem[] = [
  draft('introduction', 'Introduction', 'front_matter', 0, 'Introduction to The Art of Being.'),
  ...CHAPTERS.map(([n, title, scope]) => draft(chapterSlug(n), title, 'chapter', n, scope)),
  draft('book-glossary', 'Glossary', 'back_matter', 17, 'The book’s glossary.'),
  draft('appendix', 'Appendix', 'back_matter', 18, 'Appendix.'),
  draft('references', 'References', 'back_matter', 19, 'References.'),
]

export const ART_OF_BEING_SLUGS = ART_OF_BEING.map((c) => c.slug)
