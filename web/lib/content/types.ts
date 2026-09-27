import type { CanonStatus } from '@/lib/pci/canon'

export const LIFECYCLE = ['draft', 'review', 'approved', 'published', 'revised', 'superseded'] as const
export type Lifecycle = (typeof LIFECYCLE)[number]

export type ContentType = 'framework' | 'article' | 'chapter' | 'front_matter' | 'back_matter' | 'booklet' | 'research_note'
export type Collection = 'pci-framework' | 'art-of-being' | 'companion' | 'articles'

export interface ContentVersionRecord {
  content_version: number
  title: string
  body: string
  canon_status: CanonStatus
  canon_version: string
  status: Lifecycle
  created_at: string
  change_note: string
}

export interface ContentItem {
  id: string
  slug: string
  type: ContentType
  collection: Collection
  title: string
  summary: string
  body: string
  status: Lifecycle
  canon_status: CanonStatus
  canon_version: string
  content_version: number
  order?: number
  scope?: string
  source?: string
  related: string[]
  concepts: string[]
  updated_at: string
  published_at?: string
  history: ContentVersionRecord[]
}

export interface GlossaryTerm {
  slug: string
  term: string
  definition: string
  canon_status: CanonStatus
  see: string[]
  source?: string
}

export interface JournalPrompt {
  id: string
  ord: number
  text: string
  concept: string
  canon_status: CanonStatus
  status: Lifecycle
}

export interface Lesson {
  lesson_id: string
  module: string
  title: string
  video?: { url: string; transcript: string }
  orientation: string
  related_chapters: string[]
  related_concepts: string[]
  reading: { slug: string; section?: string }[]
  observation: string
  journal_prompt: string
  optional_observation: boolean
  resources: { label: string; href: string }[]
}

export interface Course {
  slug: string
  title: string
  summary: string
  canon_status: CanonStatus
  status: Lifecycle
  modules: { slug: string; title: string }[]
  lessons: Lesson[]
}
