import { describe, expect, it } from 'vitest'
import { BOUNDARY_STATEMENT } from '@/lib/pci/canon'
import { analyzeLocally, materialText } from '@/lib/pci/engine'
import { runPipeline } from '@/lib/pci/pipeline'
import { ObservationalReportSchema } from '@/lib/pci/schema'
import { classifyOccurrences } from '@/lib/pci/temporal'
import type { EngineInput } from '@/lib/pci/types'
import { validateOutput } from '@/lib/pci/validator'

const input = (raw: string, extra: Partial<EngineInput> = {}): EngineInput => ({
  raw,
  addenda: [],
  source_type: 'event',
  mode: 'direct',
  created_at: '2026-09-25T10:00:00.000Z',
  options: { lenses: false, causal: false },
  ...extra,
})

const SAMPLE =
  'My manager moved the deadline to Friday at the meeting this morning. I felt ignored because she didn’t even look at me when I spoke. She obviously doesn’t care about my work. I always end up doing everything myself. I’m useless at saying no. I said I would talk to her after lunch but I didn’t. I was furious and embarrassed. Honestly I don’t care anymore.'

describe('Local PCI engine', () => {
  const report = analyzeLocally(input(SAMPLE, { options: { lenses: true, causal: true } }))

  it('produces a schema-valid report that passes its own validator', () => {
    expect(ObservationalReportSchema.safeParse(report).success).toBe(true)
    const v = validateOutput(report, { material: SAMPLE })
    expect(v.violations).toEqual([])
  })

  it('represents all seven operations and ends at the boundary', () => {
    expect(Object.values(report.operations).every((o) => o.represented)).toBe(true)
    expect(report.boundary).toBe(BOUNDARY_STATEMENT)
  })

  it('creates one structured record per sentence with verbatim anchors', () => {
    expect(report.records).toHaveLength(8)
    expect(report.records[0].id).toBe('OBS-001')
    for (const r of report.records) expect(SAMPLE).toContain(r.evidence_anchors[0])
  })

  it('separates the decomposition categories', () => {
    const d = report.decomposition
    expect(d.behaviors.some((b) => b.quote.startsWith('My manager moved') && b.subject === 'other')).toBe(true)
    expect(d.interpretations.some((i) => /felt ignored/.test(i.quote))).toBe(true)
    expect(d.emotions.some((e) => /furious/.test(e.quote) && e.epistemic_class === 'SELF_REPORTED')).toBe(true)
    expect(d.identity_attributions.some((i) => /useless/.test(i.quote))).toBe(true)
    expect(d.context.map((c) => c.quote)).toEqual(expect.arrayContaining(['this morning', 'at the meeting']))
  })

  it('names the interpretation hidden in a feeling word', () => {
    const felt = report.decomposition.interpretations.find((i) => /felt ignored/.test(i.quote))
    expect(felt?.note).toMatch(/Phrased as a feeling/)
  })

  it('detects the stated-intention / behavior discrepancy and the indifference / emotion tension', () => {
    const classes = report.contradictions.map((c) => c.contradiction_class)
    expect(classes).toContain('stated_position_behavior')
    expect(classes).toContain('unresolved_tension')
    expect(report.contradictions.every((c) => c.status === 'unresolved' || c.status === 'revised')).toBe(true)
  })

  it('reports recurrence claimed by the material as reported, not documented', () => {
    const reported = report.patterns.find((p) => p.basis === 'reported')
    expect(reported?.epistemic_class).toBe('SELF_REPORTED')
    expect(report.patterns.some((p) => p.basis === 'documented')).toBe(false)
  })

  it('keeps counter-readings open where intent is assigned to another person', () => {
    expect(report.epistemic_separation.hypothesis.some((h) => /Other readings/.test(h.statement))).toBe(true)
  })

  it('runs all ten integrity checks', () => {
    expect(report.integrity_audit.checks).toHaveLength(10)
  })

  it('keeps lenses isolated and symbolic lenses symbolic', () => {
    expect(report.lens_report?.lenses.length).toBeGreaterThan(0)
    for (const l of report.lens_report!.lenses) {
      if (l.lens === 'jungian' || l.lens === 'mythological') expect(l.findings.every((f) => f.epistemic_class === 'SYMBOLIC')).toBe(true)
    }
  })

  it('keeps causal hypotheses speculative, with alternatives', () => {
    for (const h of report.causal_hypotheses ?? []) {
      expect(h.epistemic_class).toBe('SPECULATIVE')
      expect(h.alternative_mechanisms.length).toBeGreaterThan(0)
      expect(h.confidence).not.toBe('High Support')
    }
  })

  it('is deterministic', () => {
    expect(analyzeLocally(input(SAMPLE, { options: { lenses: true, causal: true } }))).toEqual(report)
  })

  it('does not read earlier material unless permitted', () => {
    const r = analyzeLocally(input(SAMPLE))
    expect(r.observed_material.longitudinal).toBe(false)
    expect(r.operations.contextual_comparison.summary).toMatch(/longitudinal comparison is off/)
  })
})

describe('Longitudinal comparison (with permission)', () => {
  const archive = [
    { id: 'j1', kind: 'journal' as const, date: '2026-06-01T09:00:00.000Z', title: 'Journal', text: 'The deadline moved again at work and I felt anxious. I always end up staying late.' },
    { id: 'j2', kind: 'journal' as const, date: '2026-07-15T09:00:00.000Z', title: 'Journal', text: 'Another deadline at work. I was anxious all afternoon. But this time I didn’t stay late.' },
    { id: 'j3', kind: 'journal' as const, date: '2026-09-01T09:00:00.000Z', title: 'Journal', text: 'We went to the beach with my sister and swam in the cold sea.' },
  ]
  const raw = 'The deadline moved to Friday at work. I felt anxious and stayed late again.'
  const report = analyzeLocally(input(raw, { archive }))

  it('compares with related earlier material and cites it verbatim', () => {
    const archiveComps = report.contextual_comparison.filter((c) => c.scope === 'archive')
    expect(archiveComps.length).toBeGreaterThan(0)
    expect(archiveComps.every((c) => c.anchors.some((a) => a.source_id))).toBe(true)
    expect(archiveComps.some((c) => c.compared[1] === 'j3')).toBe(false)
  })

  it('documents a pattern across dated sources and weighs the exception', () => {
    const documented = report.patterns.filter((p) => p.basis === 'documented')
    expect(documented.length).toBeGreaterThan(0)
    expect(documented.some((p) => p.conditions.some((c) => /exception/i.test(c)))).toBe(true)
    expect(report.pattern_adoption[0].origin_note).toMatch(/does not establish origin/)
  })

  it('passes the validator against the archive it was given', () => {
    const v = validateOutput(report, { material: raw, archive: Object.fromEntries(archive.map((a) => [a.id, a.text])) })
    expect(v.violations).toEqual([])
  })

  it('records relationships that are traceable to their sources', () => {
    expect(report.relational.length).toBeGreaterThan(0)
    for (const r of report.relational) expect(r.anchors.length).toBeGreaterThan(0)
  })
})

describe('Temporal classification', () => {
  const now = '2026-09-25T00:00:00.000Z'
  it('isolated with a single occurrence', () => expect(classifyOccurrences([now], now, true)).toBe('isolated_event'))
  it('resurfacing after a long gap', () =>
    expect(classifyOccurrences(['2026-01-01', '2026-01-08', '2026-01-15', now], now, true)).toBe('resurfacing_pattern'))
  it('historical when nothing is recent', () => expect(classifyOccurrences(['2025-01-01', '2025-01-20'], now, false)).toBe('historical_pattern'))
  it('emerging when recent occurrences dominate', () =>
    expect(classifyOccurrences(['2026-06-01', '2026-09-10', '2026-09-18', now], now, true)).toBe('emerging_pattern'))
})

describe('Pipeline (§8.2)', () => {
  it('stores valid local output', async () => {
    const r = await runPipeline({ id: 'local', model: 'x', analyze: async (i) => analyzeLocally(i) }, input(SAMPLE))
    expect(r.status).toBe('valid')
    expect(r.report?.boundary).toBe(BOUNDARY_STATEMENT)
  })

  it('quarantines a provider that prescribes', async () => {
    const good = analyzeLocally(input(SAMPLE))
    const bad = { ...good, what_became_visible: [...good.what_became_visible, { id: 'V-X', statement: 'You should talk to her after lunch.', supports: ['OBS-001'] }] }
    const r = await runPipeline({ id: 'remote', model: 'x', analyze: async () => bad }, input(SAMPLE))
    expect(r.status).toBe('quarantined')
    expect(r.report).toBeUndefined()
    expect(r.violations.some((v) => v.invariant === 'observation → prescription')).toBe(true)
  })

  it('quarantines a provider that adds a recommendation field', async () => {
    const good = analyzeLocally(input(SAMPLE))
    const r = await runPipeline({ id: 'remote', model: 'x', analyze: async () => ({ ...good, recommendation: 'Leave the job.' }) }, input(SAMPLE))
    expect(r.status).toBe('quarantined')
    expect(r.violations.some((v) => v.rule === 'schema.forbidden_field')).toBe(true)
  })

  it('quarantines invented evidence', async () => {
    const good = analyzeLocally(input(SAMPLE))
    const forged = structuredClone(good)
    forged.decomposition.events.push({ id: 'EV-X', quote: 'She shouted at me in front of everyone.', epistemic_class: 'DIRECT' })
    const r = await runPipeline({ id: 'remote', model: 'x', analyze: async () => forged }, input(SAMPLE))
    expect(r.status).toBe('quarantined')
  })

  it('re-audits external output and lowers inflated confidence', async () => {
    const good = analyzeLocally(input(SAMPLE))
    const inflated = structuredClone(good)
    inflated.patterns = inflated.patterns.map((p) => ({ ...p, confidence: 'High Support' as const }))
    const r = await runPipeline({ id: 'remote', model: 'x', analyze: async () => inflated }, input(SAMPLE))
    expect(r.status).toBe('valid')
    expect(r.report!.patterns.every((p) => p.confidence !== 'High Support')).toBe(true)
    expect(r.report!.integrity_audit.checks.find((c) => c.check === 'inference_inflation')?.result).toBe('corrected')
  })

  it('surfaces provider failure as an error, not a report', async () => {
    await expect(runPipeline({ id: 'remote', model: 'x', analyze: async () => Promise.reject(new Error('timeout')) }, input(SAMPLE))).rejects.toThrow('timeout')
  })

  it('uses the full material including guided answers and addenda', () => {
    const i = input('I cancelled the call.', { mode: 'guided', guided: { 1: 'I cancelled the call.', 2: 'The event is the cancellation.' }, addenda: [{ id: 'a1', text: 'Later she wrote back.', created_at: '2026-09-26T00:00:00Z' }] })
    expect(materialText(i)).toContain('The event is the cancellation.')
    expect(materialText(i)).toContain('Later she wrote back.')
    expect(analyzeLocally(i).observed_material.addenda).toBe(1)
  })
})
