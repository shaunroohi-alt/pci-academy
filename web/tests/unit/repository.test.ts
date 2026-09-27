import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryStore, ImmutableRecordError, type DocStore } from '@/lib/db/docstore'
import { IndexedDBStore } from '@/lib/db/local'
import { Repository, REVISION_INTERVAL_MS } from '@/lib/db/repository'
import { PRIVATE_COLLECTIONS } from '@/lib/db/types'
import { analyzeLocally } from '@/lib/pci/engine'

let clock = new Date('2026-09-25T09:00:00.000Z')
const tick = (ms: number) => (clock = new Date(clock.getTime() + ms))
let n = 0
const make = (store: DocStore = new MemoryStore()) =>
  new Repository({ store, provider: () => ({ id: 'local', model: 'test', analyze: async (i) => analyzeLocally(i) }), now: () => clock, id: () => `id-${++n}` })

let repo: Repository
beforeEach(() => {
  clock = new Date('2026-09-25T09:00:00.000Z')
  n = 0
  repo = make()
})

describe('Immutable evidence, revisable analysis (§7.5)', () => {
  it('stores raw input once and never rewrites it', async () => {
    const o = await repo.createObservation({ raw: 'I missed the train. I felt stupid.', mode: 'direct', source_type: 'event' })
    expect(Object.isFrozen(o)).toBe(true)
    await expect(repo.raw.insert('observation_inputs', { ...o, raw: 'rewritten' })).rejects.toBeInstanceOf(ImmutableRecordError)
    expect((await repo.observation(o.id))?.input.raw).toBe('I missed the train. I felt stupid.')
  })

  it('creates a new analysis version for new information, leaving the input unchanged', async () => {
    const o = await repo.createObservation({ raw: 'I missed the train. I felt stupid.', mode: 'direct', source_type: 'event' })
    const v1 = await repo.analyze(o.id)
    tick(60_000)
    await repo.addAddendum(o.id, 'Later I learned the train left early.')
    const v2 = await repo.analyze(o.id)
    const b = (await repo.observation(o.id))!
    expect(b.versions.map((v) => v.version)).toEqual([1, 2])
    expect(v1.status).toBe('valid')
    expect(v2.addenda_included).toHaveLength(1)
    expect(b.input.raw).toBe('I missed the train. I felt stupid.')
    expect(b.versions[0].report?.observed_material.addenda).toBe(0)
  })

  it('rejects empty material', async () => {
    await expect(repo.createObservation({ raw: '   ', mode: 'direct', source_type: 'event' })).rejects.toThrow()
  })

  it('deletes an observation with its versions and addenda', async () => {
    const o = await repo.createObservation({ raw: 'Something happened.', mode: 'direct', source_type: 'event' })
    await repo.analyze(o.id)
    await repo.addAddendum(o.id, 'More.')
    await repo.deleteObservation(o.id)
    expect(await repo.observation(o.id)).toBeUndefined()
    expect(await repo.raw.list('observation_versions')).toHaveLength(0)
    expect(await repo.raw.list('observation_addenda')).toHaveLength(0)
  })
})

describe('Longitudinal permission (§9.1)', () => {
  it('does not read earlier material unless permitted', async () => {
    await repo.saveLedger({ kind: 'idea', title: 'Deadlines', body: 'The deadline moved again and I stayed late.' })
    tick(86_400_000)
    const o = await repo.createObservation({ raw: 'The deadline moved again.', mode: 'direct', source_type: 'event' })
    expect(await repo.archive([o.id], o.created_at)).toBeUndefined()
    const v = await repo.analyze(o.id)
    expect(v.longitudinal).toBe(false)

    await repo.setPreferences({ longitudinal: true })
    const archive = await repo.archive([o.id], o.created_at)
    expect(archive?.map((a) => a.kind)).toEqual(['ledger'])
    const v2 = await repo.analyze(o.id)
    expect(v2.longitudinal).toBe(true)
  })

  it('never includes material created after the observation', async () => {
    await repo.setPreferences({ longitudinal: true })
    const o = await repo.createObservation({ raw: 'First.', mode: 'direct', source_type: 'event' })
    tick(1000)
    await repo.saveLedger({ kind: 'idea', body: 'Later material.' })
    expect(await repo.archive([o.id], o.created_at)).toEqual([])
  })
})

describe('Journal (§3.3)', () => {
  it('autosaves, keeps edit history after a pause, and records follow-ups', async () => {
    await repo.saveJournal({ date: '2026-09-25', prompt_id: 'JP-001', prompt_text: 'p', body: 'first' })
    await repo.saveJournal({ date: '2026-09-25', prompt_id: 'JP-001', prompt_text: 'p', body: 'first draft' })
    expect((await repo.journalEntry('2026-09-25'))?.revisions).toHaveLength(0)
    tick(REVISION_INTERVAL_MS + 1)
    const e = await repo.saveJournal({ date: '2026-09-25', prompt_id: 'JP-001', prompt_text: 'p', body: 'second' })
    expect(e.revisions.map((r) => r.body)).toEqual(['first draft'])
    const f = await repo.addFollowUp('2026-09-25', 'A day later it looked different.')
    expect(f.follow_ups).toHaveLength(1)
  })

  it('analyses a journal entry through PCI and links the observation', async () => {
    await repo.saveJournal({ date: '2026-09-25', prompt_id: 'JP-001', prompt_text: 'p', body: 'I snapped at my brother. I was tired.' })
    const { observation, version } = await repo.analyzeJournal('2026-09-25')
    expect(observation.source_ref).toMatchObject({ kind: 'journal', id: '2026-09-25' })
    expect(version.status).toBe('valid')
    expect((await repo.journalEntry('2026-09-25'))?.observation_ids).toEqual([observation.id])
  })
})

describe('Privacy controls', () => {
  it('exports every private collection and deletes all of them', async () => {
    await repo.saveLedger({ kind: 'dream', body: 'A house with no doors.' })
    await repo.saveJournal({ date: '2026-09-25', prompt_id: 'JP-001', prompt_text: 'p', body: 'x' })
    await repo.setPreferences({ longitudinal: true })
    const exp = await repo.exportAll()
    expect(Object.keys(exp.collections).sort()).toEqual([...PRIVATE_COLLECTIONS].sort())
    expect(exp.collections.ledger_entries).toHaveLength(1)
    await repo.deleteAll()
    for (const c of PRIVATE_COLLECTIONS) expect(await repo.raw.list(c)).toHaveLength(0)
    expect((await repo.preferences()).longitudinal).toBe(false)
  })

  it('keeps longitudinal comparison and training consent off by default', async () => {
    const p = await repo.preferences()
    expect(p.longitudinal).toBe(false)
    expect(p.training_consent).toBe(false)
    expect(p.twin_opt_in).toBe(false)
  })
})

describe('IndexedDB store', () => {
  it('persists across instances and enforces write-once inserts', async () => {
    const a = make(new IndexedDBStore('pci-test'))
    const o = await a.createObservation({ raw: 'Persisted material.', mode: 'direct', source_type: 'event' })
    const b = make(new IndexedDBStore('pci-test'))
    expect((await b.observation(o.id))?.input.raw).toBe('Persisted material.')
    await expect(b.raw.insert('observation_inputs', { ...o })).rejects.toBeInstanceOf(ImmutableRecordError)
  })
})
