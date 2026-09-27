// Queued synchronisation with Supabase (§9.2, §17). The device store is the
// working copy; every write is queued in an outbox and pushed when online.
// Conflicts are detected and surfaced — never resolved silently.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Doc, DocStore } from './docstore'
import type { Repository } from './repository'
import { IMMUTABLE_COLLECTIONS, PRIVATE_COLLECTIONS, type Collection, type OutboxItem } from './types'

export interface SyncStatus {
  online: boolean
  pending: number
  conflicts: OutboxItem[]
  lastSync: string | null
  syncing: boolean
  error: string | null
}

type Listener = (s: SyncStatus) => void

/** Settings-like documents where the latest write is the right answer. */
const LAST_WRITE_WINS: Collection[] = ['preferences', 'drafts', 'reading_positions', 'lesson_progress', 'course_enrollments']

interface Row {
  id: string
  doc: Doc & { updated_at?: string }
  updated_at: string
}

export class SyncEngine {
  private status: SyncStatus = { online: true, pending: 0, conflicts: [], lastSync: null, syncing: false, error: null }
  private listeners = new Set<Listener>()
  private flushing: Promise<void> | null = null
  private unsubscribe: (() => void) | null = null

  constructor(
    private local: DocStore,
    private remote: SupabaseClient,
    private newId: () => string = () => crypto.randomUUID(),
  ) {}

  attach(repo: Repository) {
    this.unsubscribe = repo.subscribe((col, op, id, doc, prev) => {
      if (!PRIVATE_COLLECTIONS.includes(col)) return
      void this.enqueue({
        collection: col,
        op,
        doc_id: id,
        doc,
        base_updated_at: (prev as { updated_at?: string } | undefined)?.updated_at,
      }).then(() => this.flush())
    })
    if (typeof window !== 'undefined') {
      this.status.online = navigator.onLine
      window.addEventListener('online', this.onOnline)
      window.addEventListener('offline', this.onOffline)
    }
  }

  detach() {
    this.unsubscribe?.()
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onOnline)
      window.removeEventListener('offline', this.onOffline)
    }
  }

  private onOnline = () => {
    this.set({ online: true })
    void this.sync()
  }
  private onOffline = () => this.set({ online: false })

  subscribe(fn: Listener) {
    this.listeners.add(fn)
    fn(this.status)
    return () => this.listeners.delete(fn)
  }

  private set(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch }
    this.listeners.forEach((l) => l(this.status))
  }

  private async outbox(): Promise<OutboxItem[]> {
    return (await this.local.list<OutboxItem>('outbox')).sort((a, b) => a.queued_at.localeCompare(b.queued_at))
  }

  private async refreshCounts() {
    const items = await this.outbox()
    this.set({ pending: items.filter((i) => i.error !== 'conflict').length, conflicts: items.filter((i) => i.error === 'conflict') })
  }

  async enqueue(item: Omit<OutboxItem, 'id' | 'queued_at' | 'attempts'>) {
    // Collapse repeated puts of the same document, keeping the earliest base.
    const existing = (await this.outbox()).find((o) => o.collection === item.collection && o.doc_id === item.doc_id && o.op === 'put' && o.error !== 'conflict')
    if (existing && item.op === 'put') {
      await this.local.put('outbox', { ...existing, doc: item.doc })
    } else {
      await this.local.put<OutboxItem>('outbox', { ...item, id: this.newId(), queued_at: new Date().toISOString(), attempts: 0 })
    }
    await this.refreshCounts()
  }

  async sync() {
    await this.flush()
    await this.pull()
  }

  flush(): Promise<void> {
    if (this.flushing) return this.flushing
    this.flushing = this.doFlush().finally(() => (this.flushing = null))
    return this.flushing
  }

  private async doFlush() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await this.refreshCounts()
      return
    }
    this.set({ syncing: true, error: null })
    try {
      for (const item of await this.outbox()) {
        if (item.error === 'conflict') continue
        try {
          await this.pushItem(item)
          await this.local.delete('outbox', item.id)
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          await this.local.put('outbox', { ...item, attempts: item.attempts + 1, error: message })
          if (message !== 'conflict') {
            this.set({ error: message })
            break
          }
        }
      }
      this.set({ lastSync: new Date().toISOString() })
    } finally {
      await this.refreshCounts()
      this.set({ syncing: false })
    }
  }

  private async pushItem(item: OutboxItem, force = false) {
    const table = this.remote.from(item.collection)
    if (item.op === 'delete') {
      const { error } = await table.delete().eq('id', item.doc_id)
      if (error) throw new Error(error.message)
      return
    }
    const doc = item.doc as Doc & { updated_at?: string; created_at?: string }
    const updated_at = doc.updated_at ?? doc.created_at ?? item.queued_at
    if (item.op === 'insert' || IMMUTABLE_COLLECTIONS.includes(item.collection)) {
      const { error } = await table.insert({ id: doc.id, doc, updated_at })
      // A duplicate key on a write-once record means it already arrived.
      if (error && error.code !== '23505') throw new Error(error.message)
      return
    }
    if (!force && !LAST_WRITE_WINS.includes(item.collection)) {
      const { data, error } = await table.select('updated_at').eq('id', doc.id).maybeSingle()
      if (error) throw new Error(error.message)
      const remoteAt = (data as { updated_at?: string } | null)?.updated_at
      // The server copy changed after this device last saw it (or was created
      // elsewhere while this device thought the document was new).
      const t = (x: string) => new Date(x).getTime()
      if (remoteAt && t(remoteAt) !== t(updated_at) && (!item.base_updated_at || t(remoteAt) > t(item.base_updated_at))) {
        throw new Error('conflict')
      }
    }
    const { error } = await table.upsert({ id: doc.id, doc, updated_at }, { onConflict: 'user_id,id' })
    if (error) throw new Error(error.message)
  }

  /** Keep this device's version of a conflicted document. */
  async resolveKeepLocal(itemId: string) {
    const item = await this.local.get<OutboxItem>('outbox', itemId)
    if (!item) return
    await this.pushItem({ ...item, error: undefined }, true)
    await this.local.delete('outbox', itemId)
    await this.refreshCounts()
  }

  /** Keep the server's version; this device's unsynced edit is saved as a Ledger entry so nothing is lost. */
  async resolveKeepRemote(itemId: string, repo: Repository) {
    const item = await this.local.get<OutboxItem>('outbox', itemId)
    if (!item) return
    const { data } = await this.remote.from(item.collection).select('doc').eq('id', item.doc_id).maybeSingle()
    const localDoc = item.doc as { body?: string; title?: string } | undefined
    if (localDoc?.body) {
      await repo.saveLedger({ kind: 'observation', title: `Unsynced copy (${item.collection})`, body: localDoc.body, tags: ['sync-conflict'] })
    }
    if (data) await this.local.put(item.collection, (data as { doc: Doc }).doc)
    await this.local.delete('outbox', itemId)
    await this.refreshCounts()
  }

  async pull() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    const pendingIds = new Set((await this.outbox()).map((o) => `${o.collection}/${o.doc_id}`))
    for (const col of PRIVATE_COLLECTIONS) {
      const { data, error } = await this.remote.from(col).select('id, doc, updated_at')
      if (error) {
        this.set({ error: error.message })
        return
      }
      const remoteIds = new Set<string>()
      for (const row of (data ?? []) as Row[]) {
        remoteIds.add(row.id)
        if (pendingIds.has(`${col}/${row.id}`)) continue
        await this.local.put(col as Collection, row.doc)
      }
      // Removed on another device, and nothing pending here: remove locally too.
      for (const d of await this.local.list(col)) if (!remoteIds.has(d.id) && !pendingIds.has(`${col}/${d.id}`)) await this.local.delete(col, d.id)
    }
    this.set({ lastSync: new Date().toISOString() })
  }

  /** Copy material created before sign-in (device-only store) into the account. */
  async adopt(from: DocStore) {
    for (const col of PRIVATE_COLLECTIONS) {
      for (const d of await from.list(col)) {
        if (await this.local.get(col, d.id)) continue
        await this.local.put(col, d)
        await this.enqueue({ collection: col, op: IMMUTABLE_COLLECTIONS.includes(col) ? 'insert' : 'put', doc_id: d.id, doc: d })
      }
    }
    await this.flush()
  }

  /** Delete every private row on the server (account data deletion). */
  async deleteRemote() {
    for (const col of PRIVATE_COLLECTIONS) {
      const { error } = await this.remote.from(col).delete().neq('id', '')
      if (error) throw new Error(error.message)
    }
    for (const o of await this.outbox()) await this.local.delete('outbox', o.id)
    await this.refreshCounts()
  }
}
