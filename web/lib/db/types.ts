import type { ContraryStepKey } from '@/lib/pci/canon'
import type { AnalysisVersion, ObservationAddendum, ObservationInput } from '@/lib/pci/schema'

export type { AnalysisVersion, ObservationAddendum, ObservationInput }

export const COLLECTIONS = [
  'observation_inputs',
  'observation_addenda',
  'observation_versions',
  'drafts',
  'journal_entries',
  'ledger_entries',
  'contrary_sessions',
  'bookmarks',
  'highlights',
  'notes',
  'reading_positions',
  'course_enrollments',
  'lesson_progress',
  'twin_versions',
  'preferences',
  'event_registrations',
  'service_requests',
  'cms_content',
  'cms_events',
  'cms_services',
  'outbox',
  'client_errors',
] as const
export type Collection = (typeof COLLECTIONS)[number]

/** Collections holding the user's private material (export / delete scope). */
export const PRIVATE_COLLECTIONS: Collection[] = [
  'observation_inputs',
  'observation_addenda',
  'observation_versions',
  'drafts',
  'journal_entries',
  'ledger_entries',
  'contrary_sessions',
  'bookmarks',
  'highlights',
  'notes',
  'reading_positions',
  'course_enrollments',
  'lesson_progress',
  'twin_versions',
  'preferences',
  'event_registrations',
  'service_requests',
]

/** Write-once collections: raw evidence is never edited (§7.5). */
export const IMMUTABLE_COLLECTIONS: Collection[] = ['observation_inputs', 'observation_addenda', 'observation_versions', 'twin_versions']

export interface Draft {
  id: string
  updated_at: string
  mode: 'guided' | 'direct'
  source_type: string
  raw: string
  guided: Record<string, string>
  step: number
}

export interface JournalRevision {
  at: string
  body: string
}

export interface FollowUp {
  id: string
  at: string
  text: string
}

export interface JournalEntry {
  id: string // YYYY-MM-DD
  date: string
  prompt_id: string
  prompt_text: string
  body: string
  tags: string[]
  created_at: string
  updated_at: string
  revisions: JournalRevision[]
  follow_ups: FollowUp[]
  observation_ids: string[]
  source?: { kind: 'lesson'; id: string; label: string }
}

export const LEDGER_KINDS = [
  'observation',
  'idea',
  'question',
  'quote',
  'contradiction',
  'creative_fragment',
  'dream',
  'decision',
  'conversation',
  'event',
  'hypothesis',
  'symbol',
] as const
export type LedgerKind = (typeof LEDGER_KINDS)[number]

export const LEDGER_KIND_LABELS: Record<LedgerKind, string> = {
  observation: 'Observation',
  idea: 'Idea',
  question: 'Question',
  quote: 'Quote',
  contradiction: 'Contradiction',
  creative_fragment: 'Creative fragment',
  dream: 'Dream',
  decision: 'Decision',
  conversation: 'Conversation',
  event: 'Event',
  hypothesis: 'Hypothesis',
  symbol: 'Symbol',
}

export interface MaterialLink {
  kind: 'observation' | 'journal' | 'ledger' | 'contrary' | 'library' | 'course'
  id: string
  label: string
}

export interface LedgerEntry {
  id: string
  kind: LedgerKind
  title: string
  body: string
  tags: string[]
  archived: boolean
  created_at: string
  updated_at: string
  links: MaterialLink[]
}

export interface ContrarySession {
  id: string
  title: string
  steps: Partial<Record<ContraryStepKey, string>>
  current_step: number
  status: 'in_progress' | 'complete'
  source?: MaterialLink
  observation_id?: string
  created_at: string
  updated_at: string
}

export interface Bookmark {
  id: string
  content_slug: string
  content_title: string
  href: string
  block: number
  excerpt: string
  created_at: string
}

export interface Highlight {
  id: string
  content_slug: string
  content_version: number
  block: number
  text: string
  created_at: string
}

export interface Note {
  id: string
  content_slug: string
  block: number
  text: string
  created_at: string
  updated_at: string
}

export interface ReadingPosition {
  id: string // content slug
  content_title: string
  href: string
  block: number
  progress: number
  updated_at: string
}

export interface CourseEnrollment {
  id: string // course slug
  started_at: string
}

export interface LessonProgress {
  id: string // `${course}/${lesson}`
  course_slug: string
  lesson_slug: string
  opened_at: string
  completed_at?: string
}

export type Appearance = 'system' | 'light' | 'dark' | 'paper'

export interface Preferences {
  id: 'preferences'
  onboarding_complete: boolean
  /** Explicit permission for the engine to read earlier material (§9.1). Off by default. */
  longitudinal: boolean
  /** Authorisation to reuse private material for training. Off by default; nothing in the app reads it as true. */
  training_consent: boolean
  appearance: Appearance
  reader_size: number
  audio_rate: number
  audio_voice: string
  provider: 'local' | 'remote'
  lenses_default: boolean
  causal_default: boolean
  twin_opt_in: boolean
  /** Have Claude write each report's observation and analysis as prose. Sends the material to Anthropic. */
  writeup: boolean
  updated_at: string
}

export const DEFAULT_PREFERENCES: Preferences = {
  id: 'preferences',
  onboarding_complete: false,
  longitudinal: false,
  training_consent: false,
  appearance: 'system',
  reader_size: 19,
  audio_rate: 1,
  audio_voice: '',
  provider: 'local',
  lenses_default: false,
  causal_default: false,
  twin_opt_in: false,
  writeup: true,
  updated_at: new Date(0).toISOString(),
}

export interface TwinElement {
  id: string
  statement: string
  supporting: { source_id: string; date: string; quote: string }[]
  contradicting: { source_id: string; date: string; quote: string }[]
  epistemic_class: 'PATTERN_SUPPORTED' | 'INFERRED'
  confidence: string
  contexts: string[]
  first_observed: string
  last_observed: string
  status: 'new' | 'supported' | 'narrowed' | 'contradicted' | 'dissolved'
  revision_note: string
}

export interface TwinVersion {
  id: string
  version: number
  created_at: string
  sources: number
  span_days: number
  elements: TwinElement[]
  dissolved: TwinElement[]
}

export interface EventRegistration {
  id: string
  event_id: string
  event_title: string
  created_at: string
  note: string
}

export interface ServiceRequest {
  id: string
  service_id: string
  service_title: string
  preferred: string
  message: string
  status: 'requested' | 'cancelled'
  created_at: string
}

export interface CommunityEvent {
  id: string
  title: string
  kind: 'gathering' | 'seminar' | 'discussion'
  starts_at: string
  location: string
  description: string
  capacity: number | null
  status: 'draft' | 'published'
}

export interface ServiceOffering {
  id: string
  title: string
  kind: 'coaching' | 'consultation' | 'workshop'
  description: string
  duration_minutes: number
  price_note: string
  status: 'draft' | 'published'
}

export interface OutboxItem {
  id: string
  collection: Collection
  op: 'put' | 'insert' | 'delete'
  doc_id: string
  doc?: unknown
  base_updated_at?: string
  queued_at: string
  attempts: number
  error?: string
}

export interface ClientError {
  id: string
  at: string
  message: string
  route: string
}
