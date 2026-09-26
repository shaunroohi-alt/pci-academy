// GENERATED from web/lib/pci by scripts/sync-edge-shared.mjs — do not edit here.
// Operation 7: Observational Report (§4.9). "What Became Visible" is a set of
// statements, each traceable to findings. The report ends at observation.
import type { DecompositionResult } from './decomposition.ts'
import type { DraftReport } from './integrity.ts'
import type { ObservationalReport, VisibleStatement } from './schema.ts'
import { plural, q, unique } from './text.ts'

export function visibleStatements(d: DecompositionResult, r: Omit<DraftReport, 'what_became_visible' | 'operations' | 'boundary'>): VisibleStatement[] {
  const out: VisibleStatement[] = []
  const add = (statement: string, supports: string[]) => {
    if (supports.length) out.push({ id: `V-${String(out.length + 1).padStart(2, '0')}`, statement, supports })
  }
  const dec = d.decomposition
  const counts: [string, number][] = [
    ['described occurrence', dec.events.length],
    ['described action', dec.behaviors.length],
    ['interpretation', dec.interpretations.length],
    ['reported emotion', dec.emotions.length],
    ['judgment', dec.judgments.length],
    ['assumption', dec.assumptions.length],
    ['expectation', dec.expectations.length],
    ['identity attribution', dec.identity_attributions.length],
  ]
  const present = counts.filter(([, n]) => n > 0)
  if (present.length) {
    add(`The material separates into ${present.map(([l, n]) => plural(n, l)).join(', ')}, across ${plural(d.records.length, 'record')}.`, d.records.map((x) => x.id))
  }

  const occurrences = dec.events.length + dec.behaviors.length
  const meaning = dec.interpretations.length + dec.judgments.length + dec.identity_attributions.length
  if (meaning > 0 && meaning > occurrences) {
    add(`Meaning outweighs description: ${plural(meaning, 'statement')} assign meaning, evaluation or identity, against ${plural(occurrences, 'described occurrence or action', 'described occurrences or actions')}.`, [...dec.interpretations, ...dec.judgments].slice(0, 4).map((x) => x.id))
  }

  const otherIntent = dec.interpretations.filter((i) => i.subject === 'other')
  if (otherIntent.length) {
    add(`Intent or inner state is assigned to another person ${plural(otherIntent.length, 'time')}; that person’s own account does not appear in the material.`, otherIntent.map((x) => x.id))
  }

  const feeling = d.clauses.filter((c) => c.interpretiveFeeling)
  if (feeling.length) {
    const ids = dec.interpretations.filter((i) => feeling.some((f) => f.text === i.quote)).map((x) => x.id)
    add(`${q(feeling[0].interpretiveFeeling!)} is phrased as a feeling, and it also describes another person’s conduct. The feeling and the reading of the conduct can be held apart.`, ids)
  }

  if (dec.identity_attributions.length) {
    add(`Identity language appears (${dec.identity_attributions.slice(0, 2).map((x) => q(x.quote)).join(', ')}): conduct or feeling is stated as what someone is.`, dec.identity_attributions.map((x) => x.id))
  }

  const absolutes = unique(d.clauses.flatMap((c) => c.absolutes.map((a) => a.toLowerCase())))
  if (absolutes.length) {
    const reported = r.patterns.filter((p) => p.basis === 'reported')
    add(`Absolute terms appear (${absolutes.slice(0, 4).map(q).join(', ')}). The material itself documents the present instance, not the others it refers to.`, [...reported.map((p) => p.id), ...dec.assumptions.slice(0, 2).map((x) => x.id)])
  }

  if (dec.emotions.length) {
    const families = unique(d.clauses.flatMap((c) => c.emotions.map((e) => e.family)))
    const alongside = dec.judgments.length ? ' alongside evaluation' : dec.interpretations.length ? ' alongside interpretation' : ''
    add(`Emotion is reported (${families.join(', ')})${alongside}. The emotion is part of the material, not an error in it.`, dec.emotions.map((x) => x.id))
  }

  if (dec.expectations.length) {
    add(`An expectation is present (${q(d.clauses.find((c) => c.expectation)!.expectation!)}): a standard for what was supposed to occur shapes the account.`, dec.expectations.map((x) => x.id))
  }

  for (const c of r.contradictions.slice(0, 2)) {
    add(
      c.status === 'revised'
        ? `A revision is visible between ${q(c.a.quote)} and ${q(c.b.quote)}. Both positions stay on record.`
        : `Tension is visible between ${q(c.a.quote)} and ${q(c.b.quote)}. It is left unresolved.`,
      [c.id],
    )
  }

  for (const p of r.patterns.filter((x) => x.basis === 'documented').slice(0, 2)) add(p.description, [p.id])
  for (const p of r.patterns.filter((x) => x.basis === 'within_material').slice(0, 1)) add(p.description, [p.id])
  for (const t of r.temporal.slice(0, 1)) add(t.description, [t.id])

  const direction = d.clauses.find((c) => c.directionRequest)
  if (direction) {
    add(`A request for direction is present (${q(direction.directionRequest!)}). It is kept as material; the PCI Engine does not answer it.`, [direction.record_id])
  }
  const classification = d.clauses.find((c) => c.classificationRequest)
  if (classification) {
    add(`A request to classify a condition or type is present (${q(classification.classificationRequest!)}). PCI does not classify people; the question is kept as material.`, [classification.record_id])
  }
  const harm = d.clauses.find((c) => c.harm)
  if (harm) add('Harm or loss is named in the material. It is recorded as named and is not reinterpreted.', [harm.record_id])
  if (r.epistemic_separation.symbolic.length) add('Symbolic or dream material is present and is held as symbol, not as fact.', r.epistemic_separation.symbolic.map((x) => x.id))
  if (r.epistemic_separation.philosophical.length) add('A philosophical proposition is present; its coherence is not treated as proof.', r.epistemic_separation.philosophical.map((x) => x.id))

  if (dec.unknowns.length) {
    add(`${plural(dec.unknowns.length, 'relevant unknown')} ${dec.unknowns.length === 1 ? 'is' : 'are'} identified, including: ${dec.unknowns[0].note}`, dec.unknowns.map((x) => x.id))
  }

  if (d.records.length <= 1 && d.material.split(/\s+/).length < 12) {
    add('The material is brief. Most operations return little because little is present.', d.records.map((x) => x.id))
  }
  return out
}

export function operationsCoverage(d: DecompositionResult, r: Omit<DraftReport, 'operations' | 'boundary'>, longitudinal: boolean): ObservationalReport['operations'] {
  const dec = d.decomposition
  const decCount = Object.values(dec).reduce((n, xs) => n + xs.length, 0)
  const cats = Object.entries(dec).filter(([, xs]) => xs.length).length
  const within = r.contextual_comparison.filter((c) => c.scope === 'within_material').length
  const archive = r.contextual_comparison.filter((c) => c.scope === 'archive').length
  const sep = r.epistemic_separation
  return {
    input: { represented: true, summary: `${d.material.length} characters preserved unchanged as ${plural(d.records.length, 'observation record')}.` },
    decomposition: { represented: true, summary: `${plural(decCount, 'item')} separated across ${plural(cats, 'category', 'categories')}.` },
    contextual_comparison: {
      represented: true,
      summary: `${plural(within, 'within-material comparison')}; ${longitudinal ? plural(archive, 'comparison') + ' with earlier material' : 'longitudinal comparison is off, so earlier material was not read'}.`,
    },
    pattern_detection: {
      represented: true,
      summary: r.patterns.length
        ? `${plural(r.patterns.length, 'pattern')}: ${r.patterns.filter((p) => p.basis === 'reported').length} reported, ${r.patterns.filter((p) => p.basis === 'within_material').length} within the material, ${r.patterns.filter((p) => p.basis === 'documented').length} documented across dated material.`
        : 'No recurrence is reported or visible in the available material.',
    },
    contradiction_detection: {
      represented: true,
      summary: r.contradictions.length ? `${plural(r.contradictions.length, 'tension')} found; all are left visible.` : 'No inconsistency is visible in the available material.',
    },
    evidentiary_separation: {
      represented: true,
      summary: `Evidence ${sep.evidence.length}, interpretation ${sep.interpretation.length}, inference ${sep.inference.length}, hypothesis ${sep.hypothesis.length}, symbolic ${sep.symbolic.length}, philosophical ${sep.philosophical.length}, unknown ${sep.unknown.length}.`,
    },
    observational_report: { represented: true, summary: `${plural(r.what_became_visible.length, 'statement')} of what became visible. The report stops here.` },
  }
}
