// Domain repository. Enforces PCI data rules independently of storage:
//  - raw input and analysis versions are write-once (§7.5)
//  - new information creates a new analysis version; nothing is rewritten
//  - earlier material is read by the engine only with explicit permission (§9.1)
//  - export and deletion cover every private collection (§9.1)
import { CANON_VERSION, type SourceType } from '@/lib/pci/canon'
import { runPipeline, type AnalyzeCapable } from '@/lib/pci/pipeline'
import type { GuidedAnswers, ObservationalReport, SourceRef } from '@/lib/pci/schema'
import { contentHash, splitSentences, truncate } from '@/lib/pci/text'
import type { ArchiveSource, EngineInput } from '@/lib/pci/types'
import { ImmutableRecordError, type Doc, type DocStore } from './docstore'
import {
  DEFAULT_PREFERENCES,
  IMMUTABLE_COLLECTIONS,
  PRIVATE_COLLECTIONS,
  type AnalysisVersion,
  type Bookmark,
  type Collection,
  type ContrarySession,
  type CourseEnrollment,
  type Draft,
  type EventRegistration,
  type FollowUp,
  type Highlight,
  type JournalEntry,
  type LedgerEntry,
  type LessonProgress,
  type Note,
  type ObservationAddendum,
  type ObservationInput,
  type Preferences,
  type ReadingPosition,
  type ServiceRequest,
  type TwinVersion,
} from './types'

export type WriteListener = (col: Collection, op: 'put' | 'insert' | 'delete', id: string, doc?: unknown, prev?: unknown) => void

/** Writes a report's observation and analysis as prose. */
export type ReportWriter = (input: EngineInput, report: ObservationalReport) => Promise<NonNullable<AnalysisVersion['writeup']>>

export interface RepositoryDeps {
  store: DocStore
  provider: () => AnalyzeCapable
  /** Optional prose writer; when it returns undefined, reports stay structural. */
  writer?: () => ReportWriter | undefined
  now?: () => Date
  id?: () => string
  onWrite?: WriteListener
}

/** Minimum time between journal revision snapshots. */
export const REVISION_INTERVAL_MS = 5 * 60 * 1000

export interface ObservationBundle {
  input: ObservationInput
  addenda: ObservationAddendum[]
  versions: AnalysisVersion[]
}

export interface ObservationSummary {
  input: ObservationInput
  latest?: AnalysisVersion
  versions: number
}

export class Repository {
  private store: DocStore
  private provider: () => AnalyzeCapable
  private writer: () => ReportWriter | undefined
  private now: () => Date
  private newId: () => string
  private listeners = new Set<WriteListener>()

  constructor(deps: RepositoryDeps) {
    this.store = deps.store
    this.provider = deps.provider
    this.writer = deps.writer ?? (() => undefined)
    this.now = deps.now ?? (() => new Date())
    this.newId = deps.id ?? (() => crypto.randomUUID())
    if (deps.onWrite) this.listeners.add(deps.onWrite)
  }

  subscribe(fn: WriteListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private iso() {
    return this.now().toISOString()
  }

  private async put<T extends Doc>(col: Collection, doc: T) {
    const prev = await this.store.get(col, doc.id)
    if (IMMUTABLE_COLLECTIONS.includes(col) && prev) throw new ImmutableRecordError(col, doc.id)
    await this.store.put(col, doc)
    this.listeners.forEach((l) => l(col, 'put', doc.id, doc, prev))
  }
  private async insert<T extends Doc>(col: Collection, doc: T) {
    await this.store.insert(col, doc)
    this.listeners.forEach((l) => l(col, 'insert', doc.id, doc))
  }
  private async remove(col: Collection, id: string) {
    await this.store.delete(col, id)
    this.listeners.forEach((l) => l(col, 'delete', id))
  }

  // ── Preferences ─────────────────────────────────────────────────────
  async preferences(): Promise<Preferences> {
    return { ...DEFAULT_PREFERENCES, ...((await this.store.get<Preferences>('preferences', 'preferences')) ?? {}) }
  }
  async setPreferences(patch: Partial<Omit<Preferences, 'id'>>): Promise<Preferences> {
    const next = { ...(await this.preferences()), ...patch, id: 'preferences' as const, updated_at: this.iso() }
    await this.put('preferences', next)
    return next
  }

  // ── Observe drafts ──────────────────────────────────────────────────
  async draft(): Promise<Draft | undefined> {
    return this.store.get<Draft>('drafts', 'observe')
  }
  async saveDraft(d: Omit<Draft, 'id' | 'updated_at'>) {
    await this.put('drafts', { ...d, id: 'observe', updated_at: this.iso() })
  }
  async clearDraft() {
    await this.remove('drafts', 'observe')
  }

  // ── Observations: immutable input, revisable analysis ───────────────
  async createObservation(args: {
    raw: string
    mode: 'guided' | 'direct'
    source_type: SourceType
    guided?: GuidedAnswers
    source_ref?: SourceRef
  }): Promise<ObservationInput> {
    const raw = args.raw.trim()
    if (!raw) throw new Error('There is no material to observe yet.')
    const first = splitSentences(raw)[0]?.text ?? raw
    const input: ObservationInput = {
      id: this.newId(),
      created_at: this.iso(),
      source_type: args.source_type,
      mode: args.mode,
      title: truncate(first, 80),
      raw,
      content_hash: contentHash(raw),
      ...(args.guided ? { guided_answers: args.guided } : {}),
      ...(args.source_ref ? { source_ref: args.source_ref } : {}),
    }
    Object.freeze(input)
    await this.insert('observation_inputs', input)
    return input
  }

  async addAddendum(observationId: string, text: string): Promise<ObservationAddendum> {
    if (!(await this.store.get('observation_inputs', observationId))) throw new Error('Observation not found.')
    const a: ObservationAddendum = { id: this.newId(), observation_id: observationId, created_at: this.iso(), text: text.trim() }
    if (!a.text) throw new Error('The addendum is empty.')
    await this.insert('observation_addenda', a)
    return a
  }

  async observation(id: string): Promise<ObservationBundle | undefined> {
    const input = await this.store.get<ObservationInput>('observation_inputs', id)
    if (!input) return undefined
    const addenda = (await this.store.list<ObservationAddendum>('observation_addenda')).filter((a) => a.observation_id === id).sort(byCreated)
    const versions = (await this.store.list<AnalysisVersion>('observation_versions')).filter((v) => v.observation_id === id).sort((a, b) => a.version - b.version)
    return { input, addenda, versions }
  }

  async observations(): Promise<ObservationSummary[]> {
    const inputs = await this.store.list<ObservationInput>('observation_inputs')
    const versions = await this.store.list<AnalysisVersion>('observation_versions')
    return inputs
      .map((input) => {
        const vs = versions.filter((v) => v.observation_id === input.id).sort((a, b) => b.version - a.version)
        return { input, latest: vs[0], versions: vs.length }
      })
      .sort((a, b) => b.input.created_at.localeCompare(a.input.created_at))
  }

  /** Earlier material, only when the user has permitted longitudinal comparison. */
  async archive(excludeIds: string[] = [], before?: string): Promise<ArchiveSource[] | undefined> {
    const prefs = await this.preferences()
    if (!prefs.longitudinal) return undefined
    const cutoff = before ?? this.iso()
    const out: ArchiveSource[] = []
    const addenda = await this.store.list<ObservationAddendum>('observation_addenda')
    for (const o of await this.store.list<ObservationInput>('observation_inputs')) {
      if (excludeIds.includes(o.id) || o.created_at >= cutoff) continue
      const extra = addenda.filter((a) => a.observation_id === o.id && a.created_at < cutoff).map((a) => a.text)
      out.push({ id: o.id, kind: 'observation', date: o.created_at, title: o.title, text: [o.raw, ...extra].join('\n') })
    }
    for (const j of await this.store.list<JournalEntry>('journal_entries')) {
      if (excludeIds.includes(j.id) || !j.body.trim() || j.created_at >= cutoff) continue
      // A journal entry already analysed is represented by its observation.
      if (j.observation_ids.some((oid) => out.some((s) => s.id === oid))) continue
      out.push({ id: `journal:${j.id}`, kind: 'journal', date: j.created_at, title: `Journal, ${j.date}`, text: [j.body, ...j.follow_ups.map((f) => f.text)].join('\n') })
    }
    for (const l of await this.store.list<LedgerEntry>('ledger_entries')) {
      if (excludeIds.includes(l.id) || l.created_at >= cutoff || !`${l.title} ${l.body}`.trim()) continue
      out.push({ id: `ledger:${l.id}`, kind: 'ledger', date: l.created_at, title: l.title || 'Ledger entry', text: [l.title, l.body].filter(Boolean).join('\n') })
    }
    for (const c of await this.store.list<ContrarySession>('contrary_sessions')) {
      if (excludeIds.includes(c.id) || c.created_at >= cutoff) continue
      const text = Object.values(c.steps).filter(Boolean).join('\n')
      if (text.trim()) out.push({ id: `contrary:${c.id}`, kind: 'contrary', date: c.created_at, title: c.title || 'On the Contrary', text })
    }
    return out.sort((a, b) => a.date.localeCompare(b.date))
  }

  async engineInput(id: string, options: { lenses: boolean; causal: boolean }): Promise<EngineInput> {
    const bundle = await this.observation(id)
    if (!bundle) throw new Error('Observation not found.')
    const { input, addenda } = bundle
    const excludes = [input.id, ...(input.source_ref ? [input.source_ref.id, `${input.source_ref.kind}:${input.source_ref.id}`] : [])]
    const archive = await this.archive(excludes, input.created_at)
    return {
      raw: input.raw,
      addenda: addenda.map((a) => ({ id: a.id, text: a.text, created_at: a.created_at })),
      guided: input.guided_answers,
      source_type: input.source_type,
      mode: input.mode,
      created_at: input.created_at,
      ...(archive ? { archive } : {}),
      options,
    }
  }

  /** Run the PCI pipeline and store the result as the next analysis version. */
  async analyze(id: string, options: { lenses: boolean; causal: boolean } = { lenses: false, causal: false }): Promise<AnalysisVersion> {
    const engineInput = await this.engineInput(id, options)
    const result = await runPipeline(this.provider(), engineInput)
    // The written observation and analysis travel with the version, so the version stays write-once.
    let written: Pick<AnalysisVersion, 'writeup' | 'writeup_error'> = {}
    const writer = this.writer()
    if (writer && result.status === 'valid' && result.report) {
      try {
        written = { writeup: await writer(engineInput, result.report) }
      } catch (e) {
        written = { writeup_error: e instanceof Error ? e.message : 'Writing failed.' }
      }
    }
    const existing = (await this.store.list<AnalysisVersion>('observation_versions')).filter((v) => v.observation_id === id)
    const version: AnalysisVersion = {
      ...result,
      ...written,
      id: this.newId(),
      observation_id: id,
      version: existing.reduce((m, v) => Math.max(m, v.version), 0) + 1,
      created_at: this.iso(),
    }
    await this.insert('observation_versions', version)
    return version
  }

  async deleteObservation(id: string) {
    for (const a of await this.store.list<ObservationAddendum>('observation_addenda')) if (a.observation_id === id) await this.remove('observation_addenda', a.id)
    for (const v of await this.store.list<AnalysisVersion>('observation_versions')) if (v.observation_id === id) await this.remove('observation_versions', v.id)
    await this.remove('observation_inputs', id)
    for (const j of await this.store.list<JournalEntry>('journal_entries')) {
      if (j.observation_ids.includes(id)) await this.put('journal_entries', { ...j, observation_ids: j.observation_ids.filter((x) => x !== id) })
    }
  }

  // ── Journal ─────────────────────────────────────────────────────────
  async journalEntry(id: string): Promise<JournalEntry | undefined> {
    return this.store.get<JournalEntry>('journal_entries', id)
  }
  async journalEntries(): Promise<JournalEntry[]> {
    return (await this.store.list<JournalEntry>('journal_entries')).sort((a, b) => b.date.localeCompare(a.date))
  }
  /** Daily entries are keyed by date; lesson entries pass their own id. */
  async saveJournal(args: { id?: string; date: string; prompt_id: string; prompt_text: string; body: string; tags?: string[]; source?: JournalEntry['source'] }): Promise<JournalEntry> {
    const key = args.id ?? args.date
    const existing = await this.journalEntry(key)
    const at = this.iso()
    if (!existing) {
      const entry: JournalEntry = {
        id: key,
        date: args.date,
        prompt_id: args.prompt_id,
        prompt_text: args.prompt_text,
        body: args.body,
        tags: args.tags ?? [],
        created_at: at,
        updated_at: at,
        revisions: [],
        follow_ups: [],
        observation_ids: [],
        ...(args.source ? { source: args.source } : {}),
      }
      await this.put('journal_entries', entry)
      return entry
    }
    const revisions = [...existing.revisions]
    const lastSnapshot = revisions.length ? new Date(revisions[revisions.length - 1].at).getTime() : new Date(existing.created_at).getTime()
    // Edit history: keep the previous text whenever an edit arrives after a pause.
    if (existing.body.trim() && existing.body !== args.body && this.now().getTime() - lastSnapshot >= REVISION_INTERVAL_MS) {
      revisions.push({ at: existing.updated_at, body: existing.body })
    }
    const entry: JournalEntry = { ...existing, body: args.body, tags: args.tags ?? existing.tags, updated_at: at, revisions }
    await this.put('journal_entries', entry)
    return entry
  }
  async addFollowUp(id: string, text: string): Promise<JournalEntry> {
    const e = await this.journalEntry(id)
    if (!e) throw new Error('Journal entry not found.')
    const f: FollowUp = { id: this.newId(), at: this.iso(), text: text.trim() }
    const next = { ...e, follow_ups: [...e.follow_ups, f], updated_at: this.iso() }
    await this.put('journal_entries', next)
    return next
  }
  async analyzeJournal(id: string, options = { lenses: false, causal: false }): Promise<{ observation: ObservationInput; version: AnalysisVersion }> {
    const e = await this.journalEntry(id)
    if (!e?.body.trim()) throw new Error('Write something first.')
    const raw = [e.body, ...e.follow_ups.map((f) => f.text)].join('\n\n')
    const label = e.source ? `${e.source.label} (journal)` : `Journal, ${e.date}`
    const observation = await this.createObservation({ raw, mode: 'direct', source_type: 'journal_entry', source_ref: { kind: e.source ? 'lesson' : 'journal', id: e.source ? e.source.id : e.id, label } })
    await this.put('journal_entries', { ...e, observation_ids: [...e.observation_ids, observation.id], updated_at: this.iso() })
    const version = await this.analyze(observation.id, options)
    return { observation, version }
  }
  async deleteJournal(id: string) {
    await this.remove('journal_entries', id)
  }

  // ── Ledger ──────────────────────────────────────────────────────────
  async ledger(): Promise<LedgerEntry[]> {
    return (await this.store.list<LedgerEntry>('ledger_entries')).sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
  async ledgerEntry(id: string) {
    return this.store.get<LedgerEntry>('ledger_entries', id)
  }
  async saveLedger(entry: Partial<LedgerEntry> & Pick<LedgerEntry, 'kind' | 'body'>): Promise<LedgerEntry> {
    const at = this.iso()
    const existing = entry.id ? await this.ledgerEntry(entry.id) : undefined
    const next: LedgerEntry = {
      id: entry.id ?? this.newId(),
      kind: entry.kind,
      title: entry.title ?? '',
      body: entry.body,
      tags: entry.tags ?? existing?.tags ?? [],
      archived: entry.archived ?? existing?.archived ?? false,
      links: entry.links ?? existing?.links ?? [],
      created_at: existing?.created_at ?? at,
      updated_at: at,
    }
    await this.put('ledger_entries', next)
    return next
  }
  async deleteLedger(id: string) {
    await this.remove('ledger_entries', id)
  }
  async analyzeLedger(id: string, options = { lenses: false, causal: false }) {
    const l = await this.ledgerEntry(id)
    if (!l) throw new Error('Ledger entry not found.')
    const kindToSource: Partial<Record<LedgerEntry['kind'], SourceType>> = {
      dream: 'symbolic_material',
      symbol: 'symbolic_material',
      creative_fragment: 'creative_work',
      decision: 'decision',
      conversation: 'conversation',
      event: 'event',
      question: 'question',
    }
    const observation = await this.createObservation({
      raw: [l.title, l.body].filter(Boolean).join('\n'),
      mode: 'direct',
      source_type: kindToSource[l.kind] ?? 'ledger_entry',
      source_ref: { kind: 'ledger', id: l.id, label: l.title || 'Ledger entry' },
    })
    await this.saveLedger({ ...l, links: [...l.links, { kind: 'observation', id: observation.id, label: observation.title }] })
    const version = await this.analyze(observation.id, options)
    return { observation, version }
  }

  // ── On the Contrary ─────────────────────────────────────────────────
  async contrarySessions(): Promise<ContrarySession[]> {
    return (await this.store.list<ContrarySession>('contrary_sessions')).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }
  async contrary(id: string) {
    return this.store.get<ContrarySession>('contrary_sessions', id)
  }
  async saveContrary(s: Partial<ContrarySession>): Promise<ContrarySession> {
    const at = this.iso()
    const existing = s.id ? await this.contrary(s.id) : undefined
    const next: ContrarySession = {
      id: s.id ?? this.newId(),
      title: s.title ?? existing?.title ?? '',
      steps: { ...(existing?.steps ?? {}), ...(s.steps ?? {}) },
      current_step: s.current_step ?? existing?.current_step ?? 0,
      status: s.status ?? existing?.status ?? 'in_progress',
      ...((s.source ?? existing?.source) ? { source: s.source ?? existing?.source } : {}),
      ...((s.observation_id ?? existing?.observation_id) ? { observation_id: s.observation_id ?? existing?.observation_id } : {}),
      created_at: existing?.created_at ?? at,
      updated_at: at,
    }
    await this.put('contrary_sessions', next)
    return next
  }
  async deleteContrary(id: string) {
    await this.remove('contrary_sessions', id)
  }

  // ── Reader ──────────────────────────────────────────────────────────
  async bookmarks(slug?: string) {
    return (await this.store.list<Bookmark>('bookmarks')).filter((b) => !slug || b.content_slug === slug).sort(byCreatedDesc)
  }
  async toggleBookmark(b: Omit<Bookmark, 'id' | 'created_at'>): Promise<boolean> {
    const existing = (await this.bookmarks(b.content_slug)).find((x) => x.block === b.block)
    if (existing) {
      await this.remove('bookmarks', existing.id)
      return false
    }
    await this.put('bookmarks', { ...b, id: this.newId(), created_at: this.iso() })
    return true
  }
  async highlights(slug: string) {
    return (await this.store.list<Highlight>('highlights')).filter((h) => h.content_slug === slug)
  }
  async addHighlight(h: Omit<Highlight, 'id' | 'created_at'>) {
    const doc = { ...h, id: this.newId(), created_at: this.iso() }
    await this.put('highlights', doc)
    return doc
  }
  async deleteHighlight(id: string) {
    await this.remove('highlights', id)
  }
  async notes(slug?: string) {
    return (await this.store.list<Note>('notes')).filter((n) => !slug || n.content_slug === slug).sort(byCreatedDesc)
  }
  async saveNote(n: Partial<Note> & Pick<Note, 'content_slug' | 'block' | 'text'>) {
    const at = this.iso()
    const existing = n.id ? await this.store.get<Note>('notes', n.id) : undefined
    const doc: Note = { id: n.id ?? this.newId(), content_slug: n.content_slug, block: n.block, text: n.text, created_at: existing?.created_at ?? at, updated_at: at }
    await this.put('notes', doc)
    return doc
  }
  async deleteNote(id: string) {
    await this.remove('notes', id)
  }
  async readingPositions() {
    return (await this.store.list<ReadingPosition>('reading_positions')).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }
  async readingPosition(slug: string) {
    return this.store.get<ReadingPosition>('reading_positions', slug)
  }
  async setReadingPosition(p: Omit<ReadingPosition, 'updated_at'>) {
    await this.put('reading_positions', { ...p, updated_at: this.iso() })
  }

  // ── Academy ─────────────────────────────────────────────────────────
  async enroll(course: string) {
    if (!(await this.store.get('course_enrollments', course))) await this.put<CourseEnrollment>('course_enrollments', { id: course, started_at: this.iso() })
  }
  async enrollments() {
    return this.store.list<CourseEnrollment>('course_enrollments')
  }
  async lessonProgress(course?: string) {
    return (await this.store.list<LessonProgress>('lesson_progress')).filter((p) => !course || p.course_slug === course)
  }
  async markLesson(course: string, lesson: string, completed = false) {
    const id = `${course}/${lesson}`
    const existing = await this.store.get<LessonProgress>('lesson_progress', id)
    await this.enroll(course)
    await this.put<LessonProgress>('lesson_progress', {
      id,
      course_slug: course,
      lesson_slug: lesson,
      opened_at: existing?.opened_at ?? this.iso(),
      ...(completed || existing?.completed_at ? { completed_at: existing?.completed_at ?? this.iso() } : {}),
    })
  }

  // ── Cognitive Twin versions ─────────────────────────────────────────
  async twinVersions() {
    return (await this.store.list<TwinVersion>('twin_versions')).sort((a, b) => a.version - b.version)
  }
  async saveTwinVersion(v: Omit<TwinVersion, 'id' | 'created_at' | 'version'>) {
    const versions = await this.twinVersions()
    const doc: TwinVersion = { ...v, id: this.newId(), created_at: this.iso(), version: (versions.at(-1)?.version ?? 0) + 1 }
    await this.insert('twin_versions', doc)
    return doc
  }

  // ── Community & services ────────────────────────────────────────────
  async registrations() {
    return this.store.list<EventRegistration>('event_registrations')
  }
  async register(eventId: string, title: string, note = '') {
    const doc: EventRegistration = { id: eventId, event_id: eventId, event_title: title, created_at: this.iso(), note }
    await this.put('event_registrations', doc)
    return doc
  }
  async unregister(eventId: string) {
    await this.remove('event_registrations', eventId)
  }
  async serviceRequests() {
    return (await this.store.list<ServiceRequest>('service_requests')).sort(byCreatedDesc)
  }
  async requestService(r: Omit<ServiceRequest, 'id' | 'created_at' | 'status'>) {
    const doc: ServiceRequest = { ...r, id: this.newId(), created_at: this.iso(), status: 'requested' }
    await this.put('service_requests', doc)
    return doc
  }
  async cancelService(id: string) {
    const r = await this.store.get<ServiceRequest>('service_requests', id)
    if (r) await this.put('service_requests', { ...r, status: 'cancelled' })
  }

  // ── Privacy: export and deletion (§9.1) ─────────────────────────────
  async exportAll(): Promise<{ exported_at: string; canon_version: string; format: string; collections: Record<string, unknown[]> }> {
    const collections: Record<string, unknown[]> = {}
    for (const c of PRIVATE_COLLECTIONS) collections[c] = await this.store.list(c)
    return { exported_at: this.iso(), canon_version: CANON_VERSION, format: 'pci-export/1', collections }
  }

  async deleteAll() {
    for (const c of PRIVATE_COLLECTIONS) {
      for (const d of await this.store.list(c)) this.listeners.forEach((l) => l(c, 'delete', d.id))
      await this.store.clear(c)
    }
  }

  /** Raw store access for sync and CMS layers. */
  get raw(): DocStore {
    return this.store
  }
}

function byCreated<T extends { created_at: string }>(a: T, b: T) {
  return a.created_at.localeCompare(b.created_at)
}
function byCreatedDesc<T extends { created_at: string }>(a: T, b: T) {
  return b.created_at.localeCompare(a.created_at)
}
