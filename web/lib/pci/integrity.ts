// Meta-Observational Integrity Audit (§4.8). One controlled self-audit over
// the draft report before it is finalised. Corrections are surfaced only
// when they materially alter the report. Runs on local-engine output and on
// AI-provider output alike.
import { INTEGRITY_LABELS, type IntegrityCheck } from './canon.ts'
import { downgrade } from './confidence.ts'
import { INTERPRETATION_RE, INTERPRETIVE_FEELING_RE, JUDGMENT_RE, ABSOLUTE_RE } from './lexicon.ts'
import type { EpistemicItem, IntegrityAudit, ObservationalReport } from './schema.ts'
import { apos, q } from './text.ts'
import { scanText } from './validator.ts'

export type DraftReport = Omit<ObservationalReport, 'integrity_audit'>

const EXCEPTION_RE = /\b(?:except|but\s+this\s+time|not\s+this\s+time|this\s+time\s+(?:i|he|she|they)\s+(?:did|didn't)|for\s+once|unlike\s+(?:usual|before|last\s+time)|for\s+the\s+first\s+time|sometimes)\b/i

export interface AuditContext {
  material: string
  archiveTexts: string[]
}

function collectIds(node: unknown, into: Set<string>) {
  if (Array.isArray(node)) node.forEach((n) => collectIds(n, into))
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'id' && typeof v === 'string') into.add(v)
      else collectIds(v, into)
    }
  }
}

export function integrityAudit(input: DraftReport, ctx: AuditContext): { report: DraftReport; audit: IntegrityAudit } {
  const r: DraftReport = structuredClone(input)
  const results: Record<IntegrityCheck, { result: IntegrityAudit['checks'][number]['result']; note: string }> = {} as never
  const corrections: string[] = []
  const set = (check: IntegrityCheck, result: IntegrityAudit['checks'][number]['result'], note: string) => {
    results[check] = { result, note }
  }

  // 1. Inference inflation: strong labels need proportionate support.
  {
    let fixed = 0
    const support = (anchors: { source_id?: string; quote: string }[]) => new Set(anchors.map((a) => a.source_id ?? a.quote)).size
    for (const p of r.patterns) if (p.confidence === 'High Support' && support(p.occurrences) < 5) {
      p.confidence = downgrade(p.confidence)
      fixed++
    }
    for (const c of r.contextual_comparison) if (c.confidence === 'High Support' && support(c.anchors) < 5) {
      c.confidence = downgrade(c.confidence)
      fixed++
    }
    for (const t of r.temporal) if (t.confidence === 'High Support' && support(t.anchors) < 5) {
      t.confidence = downgrade(t.confidence)
      fixed++
    }
    for (const c of r.contradictions) if (c.confidence === 'High Support') {
      c.confidence = downgrade(c.confidence)
      fixed++
    }
    for (const h of r.causal_hypotheses ?? []) if (h.confidence === 'High Support') {
      h.confidence = 'Moderate Support'
      fixed++
    }
    if (fixed) corrections.push(`${fixed} confidence label(s) lowered to match the available support.`)
    set('inference_inflation', fixed ? 'corrected' : 'pass', fixed ? `${fixed} label(s) exceeded their support and were lowered.` : 'Confidence labels are proportionate to the number of independent supporting observations.')
  }

  // 2. Interpretation leakage: descriptions carrying interpretive language are not evidence.
  {
    const keep: EpistemicItem[] = []
    let moved = 0
    for (const item of r.epistemic_separation.evidence) {
      const quote = apos(item.anchors[0]?.quote ?? '')
      const marker = INTERPRETIVE_FEELING_RE.exec(quote)?.[0] ?? INTERPRETATION_RE.exec(quote)?.[0] ?? (item.epistemic_class === 'DIRECT' ? JUDGMENT_RE.exec(quote)?.[0] : undefined)
      if (marker && item.epistemic_class === 'DIRECT') {
        moved++
        r.epistemic_separation.interpretation.push({
          ...item,
          epistemic_class: 'INTERPRETIVE',
          statement: `Described conduct carries interpretive language (${q(marker)}); the occurrence and the meaning given to it are separated here.`,
        })
      } else keep.push(item)
    }
    r.epistemic_separation.evidence = keep
    if (moved) corrections.push(`${moved} item(s) moved from evidence to interpretation because the description itself assigns meaning.`)
    set('interpretation_leakage', moved ? 'corrected' : 'pass', moved ? `${moved} description(s) contained interpretive language and were reclassified.` : 'Evidence items contain description without interpretive expansion.')
  }

  // 3. Lens contamination: symbolic lenses stay symbolic.
  if (r.lens_report) {
    let fixed = 0
    for (const l of r.lens_report.lenses) {
      const ceiling = l.lens === 'jungian' || l.lens === 'mythological' ? 'SYMBOLIC' : l.lens === 'philosophical' ? 'PHILOSOPHICAL' : null
      if (!ceiling) continue
      for (const f of l.findings) {
        if (f.epistemic_class !== ceiling) {
          f.epistemic_class = ceiling
          fixed++
        }
      }
    }
    if (fixed) corrections.push(`${fixed} lens finding(s) returned to their lens’s epistemic class.`)
    set('lens_contamination', fixed ? 'corrected' : 'pass', fixed ? 'Symbolic or philosophical findings had been given a stronger class.' : 'Each lens holds its findings at its own epistemic class.')
  } else set('lens_contamination', 'not_applicable', 'Multi-lens analysis was not requested.')

  // 4. Identity inflation: no engine statement may declare what someone is.
  {
    const isInflated = (text: string) => scanText(text, ctx.material).some((v) => v.rule.startsWith('identity.') || v.rule.startsWith('diagnosis.'))
    let removed = 0
    const filter = <T extends { description?: string; statement?: string }>(xs: T[]) =>
      xs.filter((x) => {
        const bad = isInflated(x.description ?? x.statement ?? '')
        if (bad) removed++
        return !bad
      })
    r.patterns = filter(r.patterns)
    r.contextual_comparison = filter(r.contextual_comparison)
    r.temporal = filter(r.temporal)
    r.observer = filter(r.observer)
    r.relational = filter(r.relational)
    r.contradictions = filter(r.contradictions)
    r.what_became_visible = filter(r.what_became_visible)
    for (const k of Object.keys(r.epistemic_separation) as (keyof typeof r.epistemic_separation)[]) r.epistemic_separation[k] = filter(r.epistemic_separation[k])
    if (removed) corrections.push(`${removed} statement(s) removed for converting conduct or pattern into identity.`)
    set('identity_inflation', removed ? 'corrected' : 'pass', removed ? 'Statements that declared what someone is were removed.' : 'No finding converts conduct, feeling or recurrence into identity.')
  }

  // 6. Pattern overfitting (before narrative check, which depends on surviving ids).
  {
    const before = r.patterns.length
    r.patterns = r.patterns.filter((p) => {
      if (p.basis === 'within_material') return new Set(p.occurrences.map((o) => o.record_id ?? o.quote)).size >= 2
      if (p.basis === 'documented') return new Set(p.occurrences.map((o) => o.source_id ?? 'current')).size >= 2
      return true
    })
    let relabelled = 0
    for (const p of r.patterns) {
      if (p.basis === 'reported' && p.epistemic_class === 'PATTERN_SUPPORTED') {
        p.epistemic_class = 'SELF_REPORTED'
        relabelled++
      }
    }
    const dissolved = before - r.patterns.length
    if (dissolved) corrections.push(`${dissolved} pattern(s) dissolved: fewer than two independent occurrences.`)
    if (dissolved || relabelled) set('pattern_overfitting', 'corrected', `${dissolved} dissolved, ${relabelled} relabelled as self-reported.`)
    else set('pattern_overfitting', r.patterns.length ? 'pass' : 'not_applicable', r.patterns.length ? 'Every pattern rests on at least two independent occurrences, or is labelled as reported recurrence.' : 'No patterns were proposed.')
  }

  // 7. Context collapse: similar is not equivalent until context is compared.
  {
    let fixed = 0
    for (const c of r.contextual_comparison) {
      if (!c.changed_conditions.length && !c.missing_variables.some((m) => /context/i.test(m))) {
        c.missing_variables.push('Context was not compared: conditions for one or both parts are not stated.')
        fixed++
      }
    }
    set('context_collapse', fixed ? 'corrected' : r.contextual_comparison.length ? 'pass' : 'not_applicable', fixed ? `${fixed} comparison(s) lacked context and now name that absence.` : r.contextual_comparison.length ? 'Each comparison reports changed conditions or names the missing context.' : 'No comparisons were made.')
  }

  // 8. Confirmation loops: comparisons should not surface only confirming material.
  {
    const archive = r.contextual_comparison.filter((c) => c.scope === 'archive')
    if (!archive.length) set('confirmation_loops', 'not_applicable', 'No archive material was compared.')
    else {
      const allConfirming = archive.every((c) => !c.context_sensitive.length && c.changed_conditions.length <= 1)
      set('confirmation_loops', allConfirming ? 'flagged' : 'pass', allConfirming ? 'Compared material agrees in every respect found; dissimilar material may be under-represented.' : 'Compared material includes differences as well as similarities.')
    }
  }

  // 9. Counter-hypotheses: intent assigned to others keeps alternatives open.
  {
    const intent = r.decomposition.interpretations.filter((i) => i.subject === 'other')
    if (!intent.length) set('counter_hypotheses', 'not_applicable', 'No intent or state is assigned to another person.')
    else {
      let added = 0
      for (const it of intent.slice(0, 3)) {
        const has = r.epistemic_separation.hypothesis.some((h) => h.anchors.some((a) => a.quote === it.quote))
        if (!has) {
          r.epistemic_separation.hypothesis.push({
            id: `EP-A${String(++added).padStart(2, '0')}`,
            epistemic_class: 'SPECULATIVE',
            statement: `Other readings of the conduct behind ${q(it.quote)} are not excluded by the material.`,
            anchors: [{ quote: it.quote, record_id: it.record_id }],
          })
        }
      }
      if (added) corrections.push(`${added} counter-reading(s) added for intent assigned to another person.`)
      set('counter_hypotheses', added ? 'corrected' : 'pass', added ? 'Alternative readings were missing and have been added.' : 'Alternative readings are held open wherever intent is assigned to another person.')
    }
  }

  // 10. Disconfirming evidence: absolute claims are checked against exceptions.
  {
    const texts = [ctx.material, ...ctx.archiveTexts].map(apos)
    const exception = texts.map((t) => EXCEPTION_RE.exec(t)?.[0]).find(Boolean)
    let touched = 0
    for (const p of r.patterns) {
      const absolute = p.occurrences.some((o) => ABSOLUTE_RE.test(apos(o.quote)))
      if ((absolute || p.basis === 'documented') && exception && !p.conditions.some((c) => /exception/i.test(c))) {
        p.conditions.push(`Exception language appears in the available material (${q(exception)}), which counts against the pattern as stated.`)
        p.confidence = downgrade(p.confidence)
        touched++
      }
    }
    if (touched) corrections.push(`${touched} pattern(s) lowered: the material contains exceptions to them.`)
    set('disconfirming_evidence', touched ? 'corrected' : r.patterns.length ? 'pass' : 'not_applicable', touched ? 'Exceptions were found and weighed against the patterns.' : r.patterns.length ? 'No exception language was found against the stated patterns.' : 'No patterns to test.')
  }

  // 5. Narrative coherence bias: every visible statement must trace to a finding,
  //    and unresolved tension must not be smoothed out of the summary.
  {
    const ids = new Set<string>()
    collectIds({ ...r, what_became_visible: [] }, ids)
    for (const rec of r.records) ids.add(rec.id)
    const before = r.what_became_visible.length
    r.what_became_visible = r.what_became_visible.map((s) => ({ ...s, supports: s.supports.filter((x) => ids.has(x)) })).filter((s) => s.supports.length > 0)
    const removed = before - r.what_became_visible.length
    let added = 0
    if (r.contradictions.length && !r.what_became_visible.some((s) => s.supports.some((x) => r.contradictions.some((c) => c.id === x)))) {
      const c = r.contradictions[0]
      r.what_became_visible.push({ id: `V-A${String(++added).padStart(2, '0')}`, statement: `Tension remains unresolved between ${q(c.a.quote)} and ${q(c.b.quote)}.`, supports: [c.id] })
    }
    if (removed) corrections.push(`${removed} summary statement(s) removed: no traceable support.`)
    if (added) corrections.push('Unresolved tension restored to the summary.')
    set('narrative_coherence_bias', removed || added ? 'corrected' : 'pass', removed || added ? 'The summary had drifted from its findings and was corrected.' : 'Every summary statement traces to a finding; tension is not smoothed away.')
  }

  const order: IntegrityCheck[] = [
    'inference_inflation',
    'interpretation_leakage',
    'lens_contamination',
    'identity_inflation',
    'narrative_coherence_bias',
    'pattern_overfitting',
    'context_collapse',
    'confirmation_loops',
    'counter_hypotheses',
    'disconfirming_evidence',
  ]
  return {
    report: r,
    audit: { checks: order.map((check) => ({ check, ...results[check] })), corrections },
  }
}

export const INTEGRITY_CHECK_LABELS = INTEGRITY_LABELS
