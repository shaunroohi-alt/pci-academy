import { describe, expect, it } from 'vitest'
import {
  activeOperations,
  BOUNDARY_STATEMENT,
  CANON_STATUSES,
  CONFIDENCE_LEVELS,
  DEPRECATED_ARCHITECTURES,
  EPISTEMIC_CLASSES,
  INTEGRITY_CHECKS,
  PROHIBITED_TRANSFORMATIONS,
  RELATIONSHIP_TYPES,
  SEVEN_OPERATIONS,
  TEMPORAL_CLASSES,
  CONTRARY_STEPS,
  PATTERN_ADOPTION_STAGES,
} from '@/lib/pci/canon'
import { ObservationalReportSchema, FORBIDDEN_FIELDS, AnalysisVersionSchema } from '@/lib/pci/schema'

describe('Canon gate (R0.2 Canon Locked)', () => {
  it('has exactly seven active questions, in order', () => {
    expect(activeOperations()).toHaveLength(7)
    expect(SEVEN_OPERATIONS.map((o) => o.n)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(SEVEN_OPERATIONS.map((o) => o.name)).toEqual([
      'Input',
      'Decomposition',
      'Contextual Comparison',
      'Pattern Detection',
      'Contradiction Detection',
      'Evidentiary Separation',
      'Observational Report',
    ])
  })

  it('keeps the twelve-question interface inactive and deprecated', () => {
    const twelve = DEPRECATED_ARCHITECTURES.find((d) => d.key === 'twelve_question_architecture')
    expect(twelve?.active).toBe(false)
    expect(twelve?.canon_status).toBe('deprecated')
  })

  it('documents all fifteen prohibited transformations', () => {
    expect(PROHIBITED_TRANSFORMATIONS).toHaveLength(15)
    expect(PROHIBITED_TRANSFORMATIONS).toContainEqual(['observation', 'prescription'])
    expect(PROHIBITED_TRANSFORMATIONS).toContainEqual(['visibility', 'obligation'])
  })

  it('registers the canonical vocabularies', () => {
    expect(CANON_STATUSES).toHaveLength(7)
    expect(EPISTEMIC_CLASSES).toHaveLength(9)
    expect(CONFIDENCE_LEVELS).toEqual(['High Support', 'Moderate Support', 'Limited Support', 'Insufficient Evidence', 'Undetermined'])
    expect(INTEGRITY_CHECKS).toHaveLength(10)
    expect(TEMPORAL_CLASSES).toHaveLength(9)
    expect(RELATIONSHIP_TYPES).toHaveLength(13)
    expect(CONTRARY_STEPS.map((s) => s.name)).toEqual(['Identified Error', 'Implied Expectation', 'Missing Variables', 'System Relationship', 'Contrary Position', 'Balance'])
    expect(PATTERN_ADOPTION_STAGES).toHaveLength(9)
  })

  it('states the STOP boundary verbatim', () => {
    expect(BOUNDARY_STATEMENT).toBe('PCI boundary reached: the report ends at observation. No prescription is generated.')
  })
})

describe('Observation schema (§7.4)', () => {
  it('has no prescriptive field anywhere', () => {
    const json = JSON.stringify(ObservationalReportSchema.shape) + JSON.stringify(AnalysisVersionSchema.shape)
    for (const f of FORBIDDEN_FIELDS) expect(json).not.toMatch(new RegExp(`"${f}"`))
  })

  it('rejects an output carrying a recommendation field', () => {
    const r = ObservationalReportSchema.safeParse({ recommendation: 'Talk to her.' })
    expect(r.success).toBe(false)
  })
})
