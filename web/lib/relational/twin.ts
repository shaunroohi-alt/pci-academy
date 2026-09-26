// Cognitive Twin (§3.9, §18) and self-correcting theory. An opt-in,
// revisable structural model — never a declaration of a true self. Enabled
// only after enough longitudinal material exists. Every element links to
// supporting and contradicting observations; every rebuild is a new version
// that states, element by element, whether earlier elements were supported,
// narrowed, contradicted or dissolved.
import type { TwinElement, TwinVersion } from '@/lib/db/types'
import { calibrate } from '@/lib/pci/confidence'
import type { RelationalModel } from './graph'

export const TWIN_MIN_SOURCES = 12
export const TWIN_MIN_SPAN_DAYS = 21

export interface TwinReadiness {
  ready: boolean
  sources: number
  spanDays: number
  reason?: string
}

export function twinReadiness(model: RelationalModel): TwinReadiness {
  const dates = model.nodes.map((n) => new Date(n.date).getTime()).sort((a, b) => a - b)
  const spanDays = dates.length ? Math.round((dates[dates.length - 1] - dates[0]) / 86400000) : 0
  const sources = model.nodes.length
  if (sources < TWIN_MIN_SOURCES) return { ready: false, sources, spanDays, reason: `The model needs at least ${TWIN_MIN_SOURCES} pieces of dated material; there are ${sources}.` }
  if (spanDays < TWIN_MIN_SPAN_DAYS) return { ready: false, sources, spanDays, reason: `The material needs to span at least ${TWIN_MIN_SPAN_DAYS} days; it spans ${spanDays}.` }
  return { ready: true, sources, spanDays }
}

function statementFor(p: RelationalModel['patterns'][number]): string {
  const ctx = p.contexts.length ? ` Stated contexts: ${p.contexts.slice(0, 3).map((c) => `“${c}”`).join(', ')}.` : ''
  const emo = p.emotions.length ? ` Reported emotion alongside it: ${p.emotions.slice(0, 3).join(', ')}.` : ''
  return `“${p.term}” recurs in ${p.occurrences.length} pieces of material between ${p.first.slice(0, 10)} and ${p.last.slice(0, 10)}.${ctx}${emo}`
}

export function buildTwin(model: RelationalModel, previous?: TwinVersion): Omit<TwinVersion, 'id' | 'created_at' | 'version'> {
  const readiness = twinReadiness(model)
  const candidates = model.patterns.filter((p) => p.occurrences.length >= 3)
  const prevByKey = new Map((previous?.elements ?? []).map((e) => [e.id, e]))
  const elements: TwinElement[] = candidates.map((p) => {
    const prev = prevByKey.get(p.key)
    let status: TwinElement['status'] = 'new'
    let revision_note = 'First appears in this version.'
    if (prev) {
      if (p.exceptions.length > prev.contradicting.length) {
        status = 'contradicted'
        revision_note = `New material contradicts this element (${p.exceptions.length} contradicting source${p.exceptions.length === 1 ? '' : 's'}, previously ${prev.contradicting.length}).`
      } else if (p.contexts.length < prev.contexts.length) {
        status = 'narrowed'
        revision_note = `Now observed under fewer stated contexts (${p.contexts.length}, previously ${prev.contexts.length}).`
      } else {
        status = 'supported'
        revision_note = `Supported by ${p.occurrences.length} sources (previously ${prev.supporting.length}).`
      }
    }
    return {
      id: p.key,
      statement: statementFor(p),
      supporting: p.occurrences.map((o) => ({ source_id: o.source_id, date: o.date, quote: o.quote })),
      contradicting: p.exceptions.map((o) => ({ source_id: o.source_id, date: o.date, quote: o.quote })),
      epistemic_class: p.occurrences.length >= 3 ? 'PATTERN_SUPPORTED' : 'INFERRED',
      confidence: calibrate(p.occurrences.length - 1, p.exceptions.length),
      contexts: p.contexts,
      first_observed: p.first,
      last_observed: p.last,
      status,
      revision_note,
    }
  })
  const dissolved: TwinElement[] = (previous?.elements ?? [])
    .filter((e) => !elements.some((x) => x.id === e.id))
    .map((e) => ({ ...e, status: 'dissolved' as const, revision_note: 'No longer supported by three or more sources; dissolved in this version.' }))
  return { sources: readiness.sources, span_days: readiness.spanDays, elements, dissolved }
}
