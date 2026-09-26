// Queued synchronisation (§17 R5): offline entries synchronise without
// silent loss; conflicts are detected and surfaced, never overwritten.
import { beforeEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { MemoryStore } from '@/lib/db/docstore'
import { Repository } from '@/lib/db/repository'
import { SyncEngine } from '@/lib/db/sync'
import type { OutboxItem } from '@/lib/db/types'
import { analyzeLocally } from '@/lib/pci/engine'

type Row = { id: string; doc: { id: string }; updated_at: string }

/** Minimal in-memory stand-in for the parts of supabase-js the sync engine uses. */
class FakeRemote {
  tables = new Map<string, Map<string, Row>>()
  failNext = false
  t(name: string) {
    if (!this.tables.has(name)) this.tables.set(name, new Map())
    return this.tables.get(name)!
  }
  from(name: string) {
    const table = this.t(name)
    const err = () => {
      if (!this.failNext) return null
      this.failNext = false
      return { message: 'network' }
    }
    return {
      select(_cols: string) {
        const filters: [string, string][] = []
        const q = {
          eq(col: string, val: string) {
            filters.push([col, val])
            return q
          },
          async maybeSingle() {
            const row = [...table.values()].find((r) => filters.every(([c, v]) => (r as unknown as Record<string, string>)[c] === v))
            return { data: row ? { updated_at: row.updated_at, doc: row.doc } : null, error: null }
          },
          then(resolve: (v: { data: Row[]; error: null }) => void) {
            resolve({ data: [...table.values()], error: null })
          },
        }
        return q
      },
      async insert(row: Row) {
        const e = err()
        if (e) return { error: e }
        if (table.has(row.id)) return { error: { code: '23505', message: 'duplicate' } }
        table.set(row.id, row)
        return { error: null }
      },
      async upsert(row: Row) {
        const e = err()
        if (e) return { error: e }
        table.set(row.id, row)
        return { error: null }
      },
      delete() {
        return {
          async eq(_c: string, id: string) {
            table.delete(id)
            return { error: null }
          },
          async neq() {
            table.clear()
            return { error: null }
          },
        }
      },
    }
  }
}

let clock: Date
let remote: FakeRemote
let local: MemoryStore
let repo: Repository
let engine: SyncEngine

beforeEach(() => {
  clock = new Date('2026-09-25T09:00:00.000Z')
  remote = new FakeRemote()
  local = new MemoryStore()
  repo = new Repository({ store: local, provider: () => ({ id: 'local', model: 't', analyze: async (i) => analyzeLocally(i) }), now: () => clock })
  engine = new SyncEngine(local, remote as unknown as SupabaseClient)
  engine.attach(repo)
})

const settle = () => new Promise((r) => setTimeout(r, 20))

describe('Sync engine', () => {
  it('pushes writes to the remote', async () => {
    await repo.saveLedger({ kind: 'idea', body: 'A thought.' })
    await settle()
    await engine.flush()
    expect(remote.t('ledger_entries').size).toBe(1)
    expect(await local.list('outbox')).toHaveLength(0)
  })

  it('keeps failed writes queued instead of dropping them', async () => {
    remote.failNext = true
    await repo.saveLedger({ kind: 'idea', body: 'Written while the network failed.' })
    // The automatic push after the write fails…
    await settle()
    const queued = await local.list<OutboxItem>('outbox')
    expect(queued.length).toBe(1)
    expect(queued[0].error).toBe('network')
    expect(remote.t('ledger_entries').size).toBe(0)
    // …and the retry delivers it.
    await engine.flush()
    expect(remote.t('ledger_entries').size).toBe(1)
    expect(await local.list('outbox')).toHaveLength(0)
  })

  it('pushes write-once records as inserts and tolerates replays', async () => {
    const o = await repo.createObservation({ raw: 'Something occurred.', mode: 'direct', source_type: 'event' })
    await settle()
    await engine.flush()
    expect(remote.t('observation_inputs').get(o.id)).toBeTruthy()
    await engine.enqueue({ collection: 'observation_inputs', op: 'insert', doc_id: o.id, doc: o })
    await engine.flush()
    expect(await local.list('outbox')).toHaveLength(0)
  })

  it('detects a conflict when another device changed the document, and does not overwrite it', async () => {
    const e = await repo.saveJournal({ date: '2026-09-25', prompt_id: 'p', prompt_text: 'p', body: 'first' })
    await settle()
    await engine.flush()
    // Another device edits the same entry.
    remote.t('journal_entries').set(e.id, { id: e.id, doc: { ...e, body: 'from the other device' } as never, updated_at: '2026-09-25T10:00:00.000Z' })
    clock = new Date('2026-09-25T10:30:00.000Z')
    await repo.saveJournal({ date: '2026-09-25', prompt_id: 'p', prompt_text: 'p', body: 'from this device' })
    await settle()
    await engine.flush()
    const queued = await local.list<OutboxItem>('outbox')
    expect(queued.some((q) => q.error === 'conflict')).toBe(true)
    expect((remote.t('journal_entries').get(e.id)!.doc as unknown as { body: string }).body).toBe('from the other device')
  })

  it('resolving by keeping the remote copy saves this device’s text to the Ledger', async () => {
    const e = await repo.saveJournal({ date: '2026-09-25', prompt_id: 'p', prompt_text: 'p', body: 'first' })
    await settle()
    await engine.flush()
    remote.t('journal_entries').set(e.id, { id: e.id, doc: { ...e, body: 'other' } as never, updated_at: '2026-09-25T10:00:00.000Z' })
    clock = new Date('2026-09-25T10:30:00.000Z')
    await repo.saveJournal({ date: '2026-09-25', prompt_id: 'p', prompt_text: 'p', body: 'mine' })
    await settle()
    await engine.flush()
    const conflict = (await local.list<OutboxItem>('outbox')).find((q) => q.error === 'conflict')!
    await engine.resolveKeepRemote(conflict.id, repo)
    const ledger = await repo.ledger()
    expect(ledger.some((l) => l.body === 'mine' && l.tags.includes('sync-conflict'))).toBe(true)
    expect((await repo.journalEntry('2026-09-25'))?.body).toBe('other')
  })

  it('pulls remote material and removes locally what was deleted elsewhere', async () => {
    remote.t('ledger_entries').set('r1', { id: 'r1', doc: { id: 'r1', kind: 'idea', body: 'remote', title: '', tags: [], archived: false, links: [], created_at: '', updated_at: '' } as never, updated_at: '2026-09-25T00:00:00Z' })
    await engine.pull()
    expect((await repo.ledger()).map((l) => l.id)).toContain('r1')
    remote.t('ledger_entries').delete('r1')
    await engine.pull()
    expect((await repo.ledger()).map((l) => l.id)).not.toContain('r1')
  })
})
