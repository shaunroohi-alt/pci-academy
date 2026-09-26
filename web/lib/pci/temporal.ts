// Temporal intelligence (§4.2). Classifies recurrence from dated occurrences.
// Historical material is labelled as historical, never presented as current.
import { TEMPORAL_LABELS, type TemporalClass } from './canon.ts'
import { calibrate } from './confidence.ts'
import type { DecompositionResult } from './decomposition.ts'
import type { SourceMatch } from './comparison.ts'
import { RELATED_THRESHOLD, REPEAT_THRESHOLD } from './comparison.ts'
import type { TemporalFinding } from './schema.ts'
import { q, surfaceMap } from './text.ts'

const DAY = 86400000

export interface Occurrence {
  date: string
  quote: string
  source_id?: string
}

/**
 * Classify a set of dated occurrences relative to `now`.
 * `includesNow` — whether the current material is itself an occurrence.
 */
export function classifyOccurrences(dates: string[], now: string, includesNow: boolean): TemporalClass {
  const ts = [...dates].map((d) => new Date(d).getTime()).sort((a, b) => a - b)
  const t = new Date(now).getTime()
  if (ts.length <= 1) return 'isolated_event'
  const gaps = ts.slice(1).map((x, i) => (x - ts[i]) / DAY)
  const last = ts[ts.length - 1]
  const sinceLast = (t - last) / DAY
  const priorLast = ts.length >= 2 ? ts[ts.length - 2] : last
  const lastGap = (last - priorLast) / DAY
  const medianGap = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]

  if (!includesNow && sinceLast > Math.max(60, medianGap * 3)) {
    return ts.length >= 3 && sinceLast < 365 ? 'interrupted_pattern' : 'historical_pattern'
  }
  if (includesNow && ts.length >= 3 && lastGap > Math.max(45, medianGap * 3)) return 'resurfacing_pattern'
  if (ts.length >= 3) {
    const recent = ts.filter((x) => t - x <= 30 * DAY).length
    const earlier = ts.length - recent
    const span = (last - ts[0]) / DAY
    if (recent >= 2 && recent > earlier && span > 30) return 'emerging_pattern'
  }
  return 'repeated_event'
}

export function temporalFindings(d: DecompositionResult, matches: SourceMatch[], createdAt: string): TemporalFinding[] {
  const out: TemporalFinding[] = []
  if (!matches.length) return out
  let n = 0
  const id = () => `TF-${String(++n).padStart(3, '0')}`

  // Term-level recurrence across dated material.
  const byTerm = new Map<string, SourceMatch[]>()
  for (const m of matches) for (const t of m.shared.slice(0, 4)) byTerm.set(t, [...(byTerm.get(t) ?? []), m])
  const ranked = [...byTerm.entries()].filter(([, ms]) => ms.length >= 1).sort((a, b) => b[1].length - a[1].length).slice(0, 3)
  for (const [term, ms] of ranked) {
    const surface = surfaceMap(d.material, ...ms.map((m) => m.source.text))
    const dates = [...ms.map((m) => m.source.date), createdAt]
    const cls = classifyOccurrences(dates, createdAt, true)
    const sorted = [...dates].sort()
    out.push({
      id: id(),
      temporal_class: cls,
      description: `${q(surface.get(term) ?? term)} appears in ${ms.length + 1} dated pieces of material, first on ${sorted[0].slice(0, 10)}. Classified as ${TEMPORAL_LABELS[cls].toLowerCase()}. Earlier material describes its own time, not the present.`,
      anchors: [ms[0].currentAnchor, ...ms.slice(0, 3).map((m) => m.sourceAnchor)],
      first_observed: sorted[0],
      last_observed: sorted[sorted.length - 1],
      epistemic_class: ms.length + 1 >= 3 ? 'PATTERN_SUPPORTED' : 'INFERRED',
      confidence: calibrate(ms.length + 1 >= 3 ? ms.length : 1),
    })
  }

  // Surface / structure divergence.
  for (const m of matches.slice(0, 5)) {
    if (m.similarity >= REPEAT_THRESHOLD && m.structural < 0.4) {
      out.push({
        id: id(),
        temporal_class: 'surface_recurrence_structural_difference',
        description: `Material from ${m.source.date.slice(0, 10)} uses similar words, but its structure differs (what is reported as event, interpretation, emotion and judgment does not match).`,
        anchors: [m.currentAnchor, m.sourceAnchor],
        first_observed: m.source.date,
        last_observed: createdAt,
        epistemic_class: 'INFERRED',
        confidence: 'Limited Support',
      })
    } else if (m.similarity < RELATED_THRESHOLD && m.structural >= 0.7) {
      out.push({
        id: id(),
        temporal_class: 'structural_recurrence_surface_difference',
        description: `Material from ${m.source.date.slice(0, 10)} is about different things, yet it has the same structure (the same arrangement of event, interpretation, emotion and judgment).`,
        anchors: [m.currentAnchor, m.sourceAnchor],
        first_observed: m.source.date,
        last_observed: createdAt,
        epistemic_class: 'INFERRED',
        confidence: 'Limited Support',
      })
    }
  }
  return out
}
