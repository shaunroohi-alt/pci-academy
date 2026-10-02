import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { BOUNDARY_STATEMENT } from '@/lib/pci/canon'
import { asUser, freshDatabase, migrate } from './harness'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const ADMIN = '00000000-0000-4000-8000-0000000000ad'

let db: PGlite

const obs = (id: string, raw = 'I left the meeting early.') => JSON.stringify({ id, raw, content_hash: 'x', source_type: 'event' })

beforeAll(async () => {
  db = await freshDatabase()
  await migrate(db)
  await db.query(`insert into auth.users (id, email) values ($1, 'a@x'), ($2, 'b@x'), ($3, 'admin@x')`, [A, B, ADMIN])
  await db.query(`update public.profiles set role = 'admin' where id = $1`, [ADMIN])
}, 120_000)

describe('Row-Level Security: private material', () => {
  it('a user reads only their own records', async () => {
    await asUser(db, A, () => db.query(`insert into public.observation_inputs (id, doc) values ('o1', $1::jsonb)`, [obs('o1')]))
    await asUser(db, B, () => db.query(`insert into public.observation_inputs (id, doc) values ('o1', $1::jsonb)`, [obs('o1', 'B material')]))
    const seenByA = await asUser(db, A, () => db.query<{ raw: string }>(`select raw from public.observation_inputs`))
    const seenByB = await asUser(db, B, () => db.query<{ raw: string }>(`select raw from public.observation_inputs`))
    expect(seenByA.rows.map((r) => r.raw)).toEqual(['I left the meeting early.'])
    expect(seenByB.rows.map((r) => r.raw)).toEqual(['B material'])
  })

  it('anonymous callers read nothing private', async () => {
    await expect(asUser(db, null, () => db.query(`select * from public.observation_inputs`))).rejects.toThrow(/permission denied/)
  })

  it('a user cannot write a record into another user’s space', async () => {
    await expect(
      asUser(db, A, () => db.query(`insert into public.journal_entries (user_id, id, doc) values ($1, 'j', '{"id":"j"}'::jsonb)`, [B])),
    ).rejects.toThrow(/row-level security/)
  })

  it('a user cannot delete another user’s records', async () => {
    await asUser(db, A, () => db.query(`delete from public.observation_inputs where id = 'o1' and user_id = $1`, [B]))
    const stillThere = await asUser(db, B, () => db.query(`select 1 from public.observation_inputs where id = 'o1'`))
    expect(stillThere.rows).toHaveLength(1)
  })

  it('blueprint views respect the caller’s RLS', async () => {
    const r = await asUser(db, A, () => db.query<{ raw: string }>(`select raw from public.observations`))
    expect(r.rows.map((x) => x.raw)).toEqual(['I left the meeting early.'])
  })
})

describe('Immutable evidence, revisable analysis', () => {
  it('raw input cannot be updated, even by its owner', async () => {
    // No update policy exists, so RLS matches zero rows for the owner…
    const r = await asUser(db, A, () => db.query(`update public.observation_inputs set doc = jsonb_set(doc, '{raw}', '"rewritten"') where id = 'o1'`))
    expect(r.affectedRows ?? 0).toBe(0)
    const raw = await asUser(db, A, () => db.query<{ raw: string }>(`select raw from public.observation_inputs where id = 'o1'`))
    expect(raw.rows[0].raw).toBe('I left the meeting early.')
    // …and the trigger refuses even a privileged role that bypasses RLS.
    await expect(db.query(`update public.observation_inputs set doc = doc where id = 'o1'`)).rejects.toThrow(/write-once/)
  })

  it('a valid analysis version must end at the PCI boundary', async () => {
    const bad = JSON.stringify({ id: 'v1', observation_id: 'o1', version: 1, status: 'valid', report: { boundary: 'Next steps: talk to her.' } })
    await expect(asUser(db, A, () => db.query(`insert into public.observation_versions (id, doc) values ('v1', $1::jsonb)`, [bad]))).rejects.toThrow(/PCI boundary/)
    const good = JSON.stringify({ id: 'v1', observation_id: 'o1', version: 1, status: 'valid', report: { boundary: BOUNDARY_STATEMENT } })
    await asUser(db, A, () => db.query(`insert into public.observation_versions (id, doc) values ('v1', $1::jsonb)`, [good]))
  })

  it('an analysis version cannot point at another user’s observation', async () => {
    const doc = JSON.stringify({ id: 'v9', observation_id: 'nope', version: 1, status: 'quarantined' })
    await expect(asUser(db, A, () => db.query(`insert into public.observation_versions (id, doc) values ('v9', $1::jsonb)`, [doc]))).rejects.toThrow(/unknown observation/)
  })

  it('analysis versions are write-once', async () => {
    const r = await asUser(db, A, () => db.query(`update public.observation_versions set doc = jsonb_set(doc, '{status}', '"quarantined"') where id = 'v1'`))
    expect(r.affectedRows ?? 0).toBe(0)
    await expect(db.query(`update public.observation_versions set doc = doc where id = 'v1'`)).rejects.toThrow(/write-once/)
  })

  it('deleting an observation deletes its versions (deletion path)', async () => {
    await asUser(db, A, () => db.query(`delete from public.observation_inputs where id = 'o1'`))
    const left = await asUser(db, A, () => db.query(`select 1 from public.observation_versions`))
    expect(left.rows).toHaveLength(0)
  })

  it('mutable material records update time on edit', async () => {
    await asUser(db, A, () => db.query(`insert into public.ledger_entries (id, doc, updated_at) values ('l1', '{"id":"l1","kind":"idea"}'::jsonb, '2020-01-01')`))
    await asUser(db, A, () => db.query(`update public.ledger_entries set doc = '{"id":"l1","kind":"question"}'::jsonb where id = 'l1'`))
    const r = await asUser(db, A, () => db.query<{ kind: string; updated_at: Date }>(`select kind, updated_at from public.ledger_entries where id = 'l1'`))
    expect(r.rows[0].kind).toBe('question')
    expect(new Date(r.rows[0].updated_at).getFullYear()).toBeGreaterThan(2020)
  })
})

describe('Content publication validation and lifecycle', () => {
  const longBody = 'Observation is the output. '.repeat(20)

  it('members cannot write content', async () => {
    await expect(asUser(db, A, () => db.query(`insert into public.content_items (slug, type, title) values ('x', 'article', 'X')`))).rejects.toThrow(/row-level security/)
  })

  it('a title without a body cannot be published', async () => {
    await asUser(db, ADMIN, async () => {
      const item = await db.query<{ id: string }>(`insert into public.content_items (slug, type, title, current_version) values ('ch-1', 'chapter', 'Discover Your Hidden Abilities', 1) returning id`)
      await expect(
        db.query(`insert into public.content_versions (content_id, content_version, title, body, canon_status, canon_version, status) values ($1, 1, 'Discover Your Hidden Abilities', '', 'canonical', '2026.09.25', 'published')`, [item.rows[0].id]),
      ).rejects.toThrow(/publication validation failed/)
      await expect(
        db.query(`insert into public.content_versions (content_id, content_version, title, body, canon_status, canon_version, status) values ($1, 1, 'T', $2, 'canonical', '2026.09.25', 'published')`, [item.rows[0].id, 'Lorem ipsum ' + longBody]),
      ).rejects.toThrow(/publication validation failed/)
    })
  })

  it('complete content moves through the lifecycle and publishes', async () => {
    await asUser(db, ADMIN, async () => {
      const item = await db.query<{ id: string }>(`insert into public.content_items (slug, type, title, current_version) values ('art-1', 'article', 'Seven Operations', 1) returning id`)
      const id = item.rows[0].id
      await db.query(`insert into public.content_versions (content_id, content_version, title, body, canon_status, canon_version) values ($1, 1, 'Seven Operations', $2, 'canonical', '2026.09.25')`, [id, longBody])
      await expect(db.query(`update public.content_items set status = 'published' where id = $1`, [id])).rejects.toThrow(/invalid lifecycle transition/)
      for (const s of ['review', 'approved', 'published']) await db.query(`update public.content_items set status = $2 where id = $1`, [id, s])
      await db.query(`update public.content_versions set status = 'published' where content_id = $1`, [id])
    })
    const anon = await asUser(db, null, () => db.query<{ title: string }>(`select title from public.content_items`))
    expect(anon.rows.map((r) => r.title)).toEqual(['Seven Operations'])
  })

  it('published versions are immutable; revision adds a version', async () => {
    await asUser(db, ADMIN, async () => {
      const id = (await db.query<{ id: string }>(`select id from public.content_items where slug = 'art-1'`)).rows[0].id
      await expect(db.query(`update public.content_versions set body = 'changed' where content_id = $1`, [id])).rejects.toThrow(/immutable/)
      await db.query(`insert into public.content_versions (content_id, content_version, title, body, canon_status, canon_version) values ($1, 2, 'Seven Operations', $2, 'canonical', '2026.09.25')`, [id, longBody + ' Revised.'])
      const n = await db.query<{ n: number }>(`select count(*)::int as n from public.content_versions where content_id = $1`, [id])
      expect(n.rows[0].n).toBe(2)
    })
  })

  it('drafts are invisible to the public', async () => {
    const r = await asUser(db, null, () => db.query(`select 1 from public.content_items where slug = 'ch-1'`))
    expect(r.rows).toHaveLength(0)
  })
})

describe('Entitlements and payments', () => {
  it('members hold the open plan’s flags by default', async () => {
    const r = await asUser(db, A, () => db.query<{ ok: boolean }>(`select public.has_entitlement('observe.basic') as ok`))
    expect(r.rows[0].ok).toBe(true)
    const course = await asUser(db, A, () => db.query<{ ok: boolean }>(`select public.has_entitlement('academy.course.foundations') as ok`))
    expect(course.rows[0].ok).toBe(true)
  })

  it('anonymous callers hold no entitlement', async () => {
    const r = await db.query<{ ok: boolean }>(`select public.has_entitlement('observe.basic', null) as ok`)
    expect(r.rows[0].ok).toBe(false)
  })

  it('an active restricted plan replaces the default', async () => {
    await db.query(`insert into public.plans (id, name) values ('reader', 'Reader')`)
    await db.query(`insert into public.plan_entitlements (plan_id, flag) values ('reader', 'library.full')`)
    await db.query(`insert into public.subscriptions (user_id, plan_id, status) values ($1, 'reader', 'active')`, [B])
    const lib = await asUser(db, B, () => db.query<{ ok: boolean }>(`select public.has_entitlement('library.full') as ok`))
    const obs = await asUser(db, B, () => db.query<{ ok: boolean }>(`select public.has_entitlement('observe.basic') as ok`))
    expect(lib.rows[0].ok).toBe(true)
    expect(obs.rows[0].ok).toBe(false)
  })

  it('payment events are idempotent and not callable by members', async () => {
    const first = await db.query<{ ok: boolean }>(`select public.record_payment_event('evt_1', 'stripe', 'checkout.completed', '{}') as ok`)
    const replay = await db.query<{ ok: boolean }>(`select public.record_payment_event('evt_1', 'stripe', 'checkout.completed', '{}') as ok`)
    expect(first.rows[0].ok).toBe(true)
    expect(replay.rows[0].ok).toBe(false)
    await expect(asUser(db, A, () => db.query(`select public.record_payment_event('evt_2', 'x', 'y', '{}')`))).rejects.toThrow(/permission denied/)
  })

  it('members cannot grant themselves entitlements', async () => {
    await expect(asUser(db, A, () => db.query(`insert into public.entitlements (user_id, flag) values ($1, 'services.booking')`, [A]))).rejects.toThrow(/row-level security/)
  })

  it('members cannot promote themselves to admin', async () => {
    await expect(asUser(db, A, () => db.query(`update public.profiles set role = 'admin' where id = $1`, [A]))).rejects.toThrow(/administrator/)
  })
})

describe('Private semantic index', () => {
  const vec = (x: number) => `[${Array.from({ length: 256 }, (_, i) => (i === 0 ? x : 0)).join(',')}]`

  it('is isolated per user and removed with its source', async () => {
    await asUser(db, A, async () => {
      await db.query(`insert into public.journal_entries (id, doc) values ('2026-09-25', '{"id":"2026-09-25","body":"x"}'::jsonb)`)
      await db.query(`insert into public.user_embeddings (source_table, source_id, embedding, model) values ('journal_entries', '2026-09-25', $1::vector, 'hash-256')`, [vec(1)])
    })
    const bSees = await asUser(db, B, () => db.query(`select 1 from public.user_embeddings`))
    expect(bSees.rows).toHaveLength(0)
    const aMatch = await asUser(db, A, () => db.query(`select * from public.match_private($1::vector, 5)`, [vec(1)]))
    expect(aMatch.rows).toHaveLength(1)
    await asUser(db, A, () => db.query(`delete from public.journal_entries where id = '2026-09-25'`))
    const after = await asUser(db, A, () => db.query(`select 1 from public.user_embeddings`))
    expect(after.rows).toHaveLength(0)
  })
})

describe('Seed (R0.4)', () => {
  it('applies repeatably and publishes only complete texts', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const seed = readFileSync(join(__dirname, '..', '..', 'supabase', 'seed.sql'), 'utf8')
    await db.exec(seed)
    await db.exec(seed)
    const pub = await asUser(db, null, () => db.query<{ collection: string; n: number }>(`select collection, count(*)::int as n from public.content_items where slug not in ('art-1') group by collection order by collection`))
    // Anonymous readers see only published rows: the live corpus. The blueprint framework texts are drafts.
    expect(pub.rows).toEqual([
      { collection: 'art-of-being', n: 12 },
      { collection: 'companion', n: 5 },
      { collection: 'library', n: 2 },
    ])
    const sub = await asUser(db, null, () => db.query<{ slug: string; type: string }>(`select slug, type from public.content_items where collection = 'library' order by chapter_order`))
    expect(sub.rows).toEqual([
      { slug: 'other-peoples-material', type: 'sub_chapter' },
      { slug: 'coherence-in-business', type: 'sub_chapter' },
    ])
    const drafts = await db.query<{ collection: string; n: number }>(`select collection, count(*)::int as n from public.content_items where status = 'draft' and slug not in ('ch-1', 'art-1') group by collection order by collection`)
    expect(drafts.rows).toEqual([
      { collection: 'art-of-being', n: 4 },
      { collection: 'pci-framework', n: 15 },
    ])
  })
})
