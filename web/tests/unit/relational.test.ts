import { describe, expect, it } from 'vitest'
import { CONTRARY_STEPS, HARM_NOTE, BALANCE_NOTE } from '@/lib/pci/canon'
import { contraryAssist, contraryMaterial } from '@/lib/pci/contrary'
import type { ArchiveSource } from '@/lib/pci/types'
import { validateText } from '@/lib/pci/validator'
import { buildRelationalModel } from '@/lib/relational/graph'
import { relatedTo } from '@/lib/relational/related'
import { buildTwin, twinReadiness } from '@/lib/relational/twin'
import { privateDocs, publicDocs, search } from '@/lib/search'
import { FRAMEWORK } from '@/content/seeds/framework'
import { GLOSSARY } from '@/content/seeds/glossary'
import { COURSES } from '@/content/seeds/courses'
import type { JournalEntry, TwinVersion } from '@/lib/db/types'

describe('On the Contrary (§3.5, §15)', () => {
  const steps = {
    identified_error: 'My colleague took credit for my report in the meeting. It was unfair and he should have mentioned me.',
    implied_expectation: 'I expected to be named.',
    missing_variables: '',
  }

  it('surfaces expectation language from the user’s own words', () => {
    const a = contraryAssist('implied_expectation', steps)
    expect(a.observations.join(' ')).toMatch(/should have/)
  })

  it('never produces forced positivity, victim-blaming or prescription at any step', () => {
    for (const s of CONTRARY_STEPS) {
      const a = contraryAssist(s.key, steps)
      for (const o of [...a.observations, ...a.notes]) expect(validateText(o, contraryMaterial(steps)).violations, o).toEqual([])
    }
  })

  it('keeps harm named when harm is present', () => {
    const a = contraryAssist('balance', { identified_error: 'He hit me during the argument.' })
    expect(a.harm).toBe(true)
    expect(a.notes).toContain(HARM_NOTE)
    expect(a.notes).toContain(BALANCE_NOTE)
  })

  it('does not write the contrary position for the user', () => {
    const a = contraryAssist('contrary_position', steps)
    expect(a.observations.join(' ')).toMatch(/described, not adopted/)
  })
})

const day = (n: number) => new Date(Date.UTC(2026, 5, 1) + n * 86400000).toISOString()
const src = (id: string, n: number, text: string, kind: ArchiveSource['kind'] = 'journal'): ArchiveSource => ({ id, kind, date: day(n), title: id, text })

const ARCHIVE: ArchiveSource[] = [
  src('journal:1', 0, 'The deadline at work made me anxious. I stayed late again.'),
  src('journal:2', 7, 'Another deadline at work. I felt anxious and stayed late without thinking.'),
  src('journal:3', 20, 'At home the deadline did not bother me. I love my job.'),
  src('journal:4', 30, 'The deadline moved at work. Anxious again. But this time I didn’t stay late.'),
  src('ledger:a', 35, 'I hate my job some days.', 'ledger'),
  src('journal:5', 40, 'We swam in the cold sea with my sister.'),
]

describe('Relational model (§3.8, R4)', () => {
  const m = buildRelationalModel(ARCHIVE, [{ from: 'ledger:a', to: 'journal:3', label: 'about the job' }], day(45))

  it('records explicit references from the user', () => {
    expect(m.edges.some((e) => e.type === 'REFERENCES' && e.from === 'ledger:a')).toBe(true)
  })

  it('makes every inferred relationship traceable to its sources', () => {
    for (const e of m.edges.filter((x) => x.type === 'REPEATS' || x.type === 'RELATED_TO' || x.type === 'CONTRADICTS')) {
      expect(e.evidence.length).toBeGreaterThan(0)
      for (const ev of e.evidence) expect(ARCHIVE.find((a) => a.id === ev.source_id)?.text).toContain(ev.quote)
    }
  })

  it('does not relate unrelated material', () => {
    expect(m.edges.some((e) => (e.from === 'journal:5' || e.to === 'journal:5') && e.type !== 'ABSENT_UNDER' && e.type !== 'DIFFERENT_CONTEXT')).toBe(false)
  })

  it('finds a cross-source pattern, with its exception and temporal class', () => {
    const p = m.patterns.find((x) => x.key.startsWith('deadlin'))!
    expect(p.occurrences.length).toBeGreaterThanOrEqual(4)
    expect(p.exceptions.length).toBe(1)
    expect(p.stages.find((s) => s.stage === 'Revision')?.evidenced).toBe(true)
    expect(p.stages.find((s) => s.stage === 'Defaulting')?.evidenced).toBe(true)
    expect(p.confidence).not.toBe('High Support')
  })

  it('maps contradictions across time and leaves them visible', () => {
    expect(m.contradictions.some((c) => c.label === 'love / hate')).toBe(true)
    expect(m.edges.some((e) => e.type === 'CONTRADICTS')).toBe(true)
  })

  it('marks context-dependent change', () => {
    expect(m.edges.some((e) => e.type === 'CHANGES_UNDER' || e.type === 'SAME_CONTEXT')).toBe(true)
  })
})

describe('Cognitive Twin (§3.9, R6)', () => {
  it('is withheld until enough longitudinal material exists', () => {
    const m = buildRelationalModel(ARCHIVE, [], day(45))
    expect(twinReadiness(m).ready).toBe(false)
  })

  const many = Array.from({ length: 14 }, (_, i) => src(`journal:${i}`, i * 3, i === 13 ? 'The deadline came and this time I didn’t stay late.' : `Deadline pressure at work again, I stayed late on day ${i}.`))

  it('builds elements that link to supporting and contradicting material, never identity claims', () => {
    const m = buildRelationalModel(many, [], day(50))
    expect(twinReadiness(m).ready).toBe(true)
    const v1 = buildTwin(m)
    expect(v1.elements.length).toBeGreaterThan(0)
    for (const el of v1.elements) {
      expect(el.supporting.length).toBeGreaterThanOrEqual(3)
      expect(validateText(el.statement, many.map((s) => s.text).join('\n')).violations).toEqual([])
      expect(el.statement).not.toMatch(/\byou are\b/i)
    }
    expect(v1.elements.some((e) => e.contradicting.length > 0)).toBe(true)
  })

  it('self-corrects: a later version marks elements supported, contradicted or dissolved', () => {
    const m1 = buildRelationalModel(many.slice(0, 13), [], day(50))
    const v1 = { ...buildTwin(m1), id: 'v1', version: 1, created_at: day(50) } as TwinVersion
    const m2 = buildRelationalModel(many, [], day(60))
    const v2 = buildTwin(m2, v1)
    const statuses = v2.elements.map((e) => e.status)
    expect(statuses.some((s) => s === 'contradicted' || s === 'supported')).toBe(true)
    const m3 = buildRelationalModel([many[0], many[1]], [], day(70))
    const v3 = buildTwin(m3, { ...v2, id: 'v2', version: 2, created_at: day(60) })
    expect(v3.dissolved.length).toBeGreaterThan(0)
  })
})

describe('Related-entry detection', () => {
  it('returns related items with the shared words that relate them', () => {
    const r = relatedTo(
      { id: 'x', text: 'The deadline at work again.' },
      ARCHIVE.map((a) => ({ ...a, href: '#' })),
    )
    expect(r.length).toBeGreaterThan(0)
    expect(r[0].shared.join(' ')).toMatch(/deadline/)
  })
})

describe('Search (§3.7)', () => {
  const journal: JournalEntry = { id: '2026-09-25', date: '2026-09-25', prompt_id: 'x', prompt_text: 'p', body: 'A private note about contradiction at work.', tags: [], created_at: day(0), updated_at: day(0), revisions: [], follow_ups: [], observation_ids: [] }
  const docs = [...publicDocs(FRAMEWORK, GLOSSARY, COURSES), ...privateDocs({ journal: [journal], ledger: [], observations: [], contrary: [] })]

  it('labels every result with its scope', () => {
    const hits = search(docs, 'contradiction')
    expect(hits.some((h) => h.scope === 'public')).toBe(true)
    expect(hits.some((h) => h.scope === 'private')).toBe(true)
    for (const h of hits) expect(['public', 'private']).toContain(h.scope)
  })

  it('requires every query word to match', () => {
    expect(search(docs, 'contradiction zebra')).toEqual([])
  })

  it('ranks title matches first', () => {
    expect(search(docs, 'pattern adoption')[0].title).toMatch(/Pattern Adoption/)
  })
})
