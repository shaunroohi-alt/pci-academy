'use client'

import { ChevronDown } from 'lucide-react'
import * as React from 'react'
import {
  BOUNDARY_STATEMENT,
  DECOMPOSITION_CATEGORIES,
  DECOMPOSITION_LABELS,
  EPISTEMIC_BUCKETS,
  EPISTEMIC_BUCKET_LABELS,
  INTEGRITY_LABELS,
  RELATIONSHIP_LABELS,
  SEVEN_OPERATIONS,
  SOURCE_TYPE_LABELS,
  type OperationKey,
} from '@/lib/pci/canon'
import type { Anchor, ObservationalReport } from '@/lib/pci/schema'
import { cn, formatDate } from '@/lib/utils'
import { ConfidenceBadge, ContradictionBadge, EpistemicBadge, Quote, TemporalBadge } from './badges'

const SECTIONS = [
  ['visible', 'What Became Visible'],
  ['operations', 'Seven Operations'],
  ['records', 'Observation Records'],
  ['decomposition', 'Decomposition'],
  ['comparison', 'Context Differential'],
  ['temporal', 'Temporal Findings'],
  ['patterns', 'Patterns'],
  ['contradictions', 'Contradictions and Tensions'],
  ['observer', 'Observer / Observed'],
  ['relational', 'Relational Findings'],
  ['lenses', 'Lens Comparison'],
  ['causal', 'Causal Hypotheses'],
  ['ledger', 'Epistemic Ledger'],
  ['audit', 'Integrity Audit'],
  ['boundary', 'Boundary'],
] as const

function AnchorQuote({ a }: { a: Anchor }) {
  const src = a.source_date ? `Earlier material, ${formatDate(a.source_date)}` : a.record_id
  return <Quote source={src}>“{a.quote}”</Quote>
}

function Block({ id, title, count, children, empty }: { id: string; title: string; count?: number; children?: React.ReactNode; empty?: string }) {
  const hasContent = count === undefined || count > 0
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 border-t border-line pt-6 pb-8">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 id={`${id}-h`} className="display text-[26px]">
          {title}
        </h2>
        {count !== undefined ? <span className="text-[12px] text-muted">{count}</span> : null}
      </div>
      {hasContent ? children : <p className="text-[14px] text-muted">{empty ?? 'Nothing in the available material.'}</p>}
    </section>
  )
}

function Finding({ children, meta, className }: { children: React.ReactNode; meta?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-[3px] border border-line bg-raised p-4', className)}>
      {meta ? <div className="mb-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
      {children}
    </div>
  )
}

function Disclosure({ summary, children }: { summary: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="mt-3">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex cursor-pointer items-center gap-1 text-[12px] font-medium text-accent">
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
        {summary}
      </button>
      {open ? <div className="mt-3 space-y-2">{children}</div> : null}
    </div>
  )
}

export function ReportView({ report }: { report: ObservationalReport }) {
  const r = report
  const ids = React.useMemo(() => {
    const m = new Map<string, Anchor[]>()
    for (const rec of r.records) m.set(rec.id, [{ quote: rec.evidence_anchors[0], record_id: rec.id }])
    for (const cat of DECOMPOSITION_CATEGORIES) for (const it of r.decomposition[cat]) if (it.quote) m.set(it.id, [{ quote: it.quote, record_id: it.record_id }])
    for (const p of r.patterns) m.set(p.id, p.occurrences)
    for (const c of r.contradictions) m.set(c.id, [c.a, c.b])
    for (const t of r.temporal) m.set(t.id, t.anchors)
    for (const b of EPISTEMIC_BUCKETS) for (const it of r.epistemic_separation[b]) m.set(it.id, it.anchors)
    return m
  }, [r])

  const present = SECTIONS.filter(([key]) => {
    if (key === 'lenses') return Boolean(r.lens_report)
    if (key === 'causal') return Boolean(r.causal_hypotheses)
    return true
  })

  return (
    <div className="grid gap-10 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label="Report sections" className="no-print hidden lg:block">
        <ol className="sticky top-20 space-y-1 text-[12.5px]">
          {present.map(([key, label]) => (
            <li key={key}>
              <a href={`#${key}`} className="block py-0.5 text-muted hover:text-ink">
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="min-w-0">
        <Block id="visible" title="What Became Visible" count={r.what_became_visible.length}>
          <ol className="space-y-4">
            {r.what_became_visible.map((v, i) => {
              const anchors = v.supports.flatMap((s) => ids.get(s) ?? []).slice(0, 4)
              return (
                <li key={v.id} className="grid grid-cols-[28px_1fr] gap-2">
                  <span className="pt-0.5 font-display text-[18px] text-muted">{i + 1}</span>
                  <div>
                    <p className="font-serif text-[17px] leading-relaxed">{v.statement}</p>
                    {anchors.length ? (
                      <Disclosure summary={`Traced to ${anchors.length} passage${anchors.length > 1 ? 's' : ''}`}>
                        {anchors.map((a, k) => (
                          <AnchorQuote key={k} a={a} />
                        ))}
                      </Disclosure>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>
        </Block>

        <Block id="operations" title="Seven Operations">
          <ol className="grid gap-px overflow-hidden rounded-[3px] border border-line bg-line sm:grid-cols-2 sm:[&>li:last-child]:col-span-2">
            {SEVEN_OPERATIONS.map((op) => (
              <li key={op.key} className="bg-raised p-4">
                <p className="eyebrow mb-1">
                  {op.n} · {op.name}
                </p>
                <p className="text-[13.5px] text-ink-2">{r.operations[op.key as OperationKey].summary}</p>
              </li>
            ))}
          </ol>
        </Block>

        <Block id="records" title="Structured Observation Records" count={r.records.length}>
          <p className="mb-4 text-[13px] text-muted">
            {SOURCE_TYPE_LABELS[r.observed_material.source_type]} · {r.observed_material.mode === 'guided' ? 'Guided mode' : 'Direct analysis'} · {r.observed_material.characters} characters
            {r.observed_material.addenda ? ` · ${r.observed_material.addenda} addendum${r.observed_material.addenda > 1 ? 'a' : ''}` : ''}
          </p>
          <div className="space-y-3">
            {r.records.map((rec) => {
              const fields: [string, string[]][] = [
                ['Event', rec.event],
                ['Behavior', rec.behavior],
                ['Interpretation', rec.interpretation],
                ['Emotion', rec.emotion],
                ['Judgment', rec.judgment],
                ['Assumptions', rec.assumptions],
                ['Identity attribution', rec.identity_attribution],
                ['Context', rec.context],
              ]
              return (
                <Finding key={rec.id} meta={<><span className="font-mono text-[11px] font-semibold text-accent">{rec.id}</span><span className="text-[11px] text-muted">Time: {rec.time_reference}</span></>}>
                  <p className="font-serif text-[16px]">“{rec.evidence_anchors[0]}”</p>
                  <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
                    {fields
                      .filter(([, v]) => v.length)
                      .map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <dt className="w-32 shrink-0 text-muted">{k}</dt>
                          <dd className="text-ink-2">{v.map((x) => `“${x}”`).join(', ')}</dd>
                        </div>
                      ))}
                  </dl>
                  {rec.unknown_variables.length ? (
                    <ul className="mt-3 space-y-1 border-t border-line pt-2 text-[12.5px] text-muted">
                      {rec.unknown_variables.map((u) => (
                        <li key={u}>Unknown: {u}</li>
                      ))}
                    </ul>
                  ) : null}
                </Finding>
              )
            })}
          </div>
        </Block>

        <Block id="decomposition" title="Decomposition">
          <div className="space-y-6">
            {DECOMPOSITION_CATEGORIES.map((cat) => {
              const items = r.decomposition[cat]
              if (!items.length) return null
              return (
                <div key={cat}>
                  <h3 className="eyebrow mb-2">
                    {DECOMPOSITION_LABELS[cat]} <span className="text-muted">· {items.length}</span>
                  </h3>
                  <ul className="space-y-2">
                    {items.map((it) => (
                      <li key={it.id} className="grid gap-1 border-b border-line pb-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:gap-4">
                        <p className="font-serif text-[15px]">{it.quote ? `“${it.quote}”` : <span className="text-muted">—</span>}</p>
                        <div className="text-[13px] text-ink-2">
                          <EpistemicBadge value={it.epistemic_class} className="mb-1 mr-2" />
                          {it.note}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </Block>

        <Block id="comparison" title="Context Differential" count={r.contextual_comparison.length} empty={r.observed_material.longitudinal ? 'No structurally similar material was found.' : 'No parts of this material share content under different conditions. Longitudinal comparison is off, so earlier material was not read.'}>
          <div className="space-y-4">
            {r.contextual_comparison.map((c) => (
              <Finding key={c.id} meta={<><span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{c.scope === 'archive' ? 'With earlier material' : 'Within this material'}</span><EpistemicBadge value={c.epistemic_class} /><ConfidenceBadge value={c.confidence} /></>}>
                <p className="text-[14.5px]">{c.description}</p>
                <div className="mt-3 grid gap-4 text-[13px] sm:grid-cols-2">
                  {(
                    [
                      ['Constants', c.constants],
                      ['Changed conditions', c.changed_conditions],
                      ['Context-sensitive', c.context_sensitive],
                      ['Context-invariant', c.context_invariant],
                      ['Missing comparison variables', c.missing_variables],
                    ] as [string, string[]][]
                  )
                    .filter(([, v]) => v.length)
                    .map(([k, v]) => (
                      <div key={k}>
                        <p className="eyebrow mb-1">{k}</p>
                        <ul className="space-y-0.5 text-ink-2">
                          {v.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                </div>
                <Disclosure summary="Compared passages">
                  {c.anchors.map((a, k) => (
                    <AnchorQuote key={k} a={a} />
                  ))}
                </Disclosure>
              </Finding>
            ))}
          </div>
        </Block>

        <Block id="temporal" title="Temporal Findings" count={r.temporal.length} empty={r.observed_material.longitudinal ? 'No recurrence across dated material was found.' : 'Temporal classification needs dated material to compare against. Longitudinal comparison is off.'}>
          <div className="space-y-3">
            {r.temporal.map((t) => (
              <Finding key={t.id} meta={<><TemporalBadge value={t.temporal_class} /><EpistemicBadge value={t.epistemic_class} /><ConfidenceBadge value={t.confidence} /></>}>
                <p className="text-[14.5px]">{t.description}</p>
                <Disclosure summary="Occurrences">
                  {t.anchors.map((a, k) => (
                    <AnchorQuote key={k} a={a} />
                  ))}
                </Disclosure>
              </Finding>
            ))}
          </div>
        </Block>

        <Block id="patterns" title="Patterns" count={r.patterns.length} empty="No recurrence is reported or visible in the available material.">
          <div className="space-y-3">
            {r.patterns.map((p) => (
              <Finding
                key={p.id}
                meta={
                  <>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{p.basis === 'reported' ? 'Reported by the material' : p.basis === 'within_material' ? 'Within this material' : 'Across dated material'}</span>
                    {p.temporal_class ? <TemporalBadge value={p.temporal_class} /> : null}
                    <EpistemicBadge value={p.epistemic_class} />
                    <ConfidenceBadge value={p.confidence} />
                  </>
                }
              >
                <p className="text-[14.5px]">{p.description}</p>
                {p.conditions.length ? (
                  <ul className="mt-2 space-y-0.5 text-[13px] text-ink-2">
                    {p.conditions.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                ) : null}
                <Disclosure summary={`${p.occurrences.length} occurrence${p.occurrences.length > 1 ? 's' : ''}`}>
                  {p.occurrences.map((a, k) => (
                    <AnchorQuote key={k} a={a} />
                  ))}
                </Disclosure>
              </Finding>
            ))}
            {r.pattern_adoption.map((pa) => (
              <Finding key={pa.id} meta={<span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Pattern Adoption · {pa.pattern_id}</span>}>
                <p className="mb-3 text-[14px]">{pa.description}</p>
                <ol className="grid gap-1.5 sm:grid-cols-3">
                  {pa.stages.map((s) => (
                    <li key={s.stage} className={cn('rounded-[3px] border px-3 py-2 text-[12.5px]', s.evidenced ? 'border-line-strong bg-surface' : 'border-dashed border-line text-muted')}>
                      <p className="font-semibold">
                        {s.stage} <span className="font-normal text-muted">· {s.evidenced ? 'evidenced' : 'not evidenced'}</span>
                      </p>
                      {s.evidenced ? <p className="mt-0.5 text-ink-2">{s.note}</p> : null}
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-[12.5px] italic text-muted">{pa.origin_note}</p>
              </Finding>
            ))}
          </div>
        </Block>

        <Block id="contradictions" title="Contradictions and Tensions" count={r.contradictions.length} empty="No inconsistency is visible in the available material.">
          <div className="space-y-3">
            {r.contradictions.map((c) => (
              <Finding key={c.id} meta={<><ContradictionBadge value={c.contradiction_class} /><span className="text-[11px] text-muted">{c.status === 'revised' ? 'Revised — both positions kept' : 'Unresolved'}</span><ConfidenceBadge value={c.confidence} /></>}>
                <p className="mb-3 text-[14.5px]">{c.description}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <AnchorQuote a={c.a} />
                  <AnchorQuote a={c.b} />
                </div>
                <p className="mt-3 text-[12px] text-muted">
                  Compared on — {Object.entries(c.compared_on).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                </p>
              </Finding>
            ))}
          </div>
        </Block>

        <Block id="observer" title="Observer / Observed" count={r.observer.length} empty="The material does not supply observer-side findings.">
          <div className="space-y-3">
            {r.observer.map((o) => (
              <Finding key={o.id} meta={<><span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{o.dimension.replace(/_/g, ' ')}</span><EpistemicBadge value={o.epistemic_class} /></>}>
                <p className="text-[14.5px]">{o.description}</p>
              </Finding>
            ))}
          </div>
        </Block>

        <Block id="relational" title="Relational Findings" count={r.relational.length} empty={r.observed_material.longitudinal ? 'No relationship to earlier material was found.' : 'Relational findings need earlier material. Longitudinal comparison is off.'}>
          <ul className="space-y-2">
            {r.relational.map((f) => (
              <li key={f.id} className="flex flex-col gap-1 border-b border-line pb-2 sm:flex-row sm:items-baseline sm:gap-4">
                <span className="w-40 shrink-0 text-[12px] font-semibold uppercase tracking-wide text-accent">{RELATIONSHIP_LABELS[f.relationship]}</span>
                <span className="text-[14px] text-ink-2">{f.description}</span>
              </li>
            ))}
          </ul>
        </Block>

        {r.lens_report ? (
          <Block id="lenses" title="Lens Comparison" count={r.lens_report.lenses.length}>
            <p className="mb-4 text-[13px] text-muted">Each lens holds its findings under its own label before anything is compared. A lens adds a way of looking, not additional evidence.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {r.lens_report.lenses.map((l) => (
                <Finding key={l.lens} meta={<span className="text-[12px] font-semibold">{l.label}</span>}>
                  <ul className="space-y-2 text-[13.5px]">
                    {l.findings.map((f) => (
                      <li key={f.id}>
                        <EpistemicBadge value={f.epistemic_class} className="mr-2" />
                        {f.description}
                      </li>
                    ))}
                  </ul>
                </Finding>
              ))}
            </div>
            <div className="mt-5 grid gap-4 text-[13px] sm:grid-cols-2">
              {(
                [
                  ['Convergence', r.lens_report.comparison.convergence],
                  ['Divergence', r.lens_report.comparison.divergence],
                  ['Orthogonality', r.lens_report.comparison.orthogonality],
                  ['Epistemic asymmetry', r.lens_report.comparison.epistemic_asymmetry],
                ] as [string, string[]][]
              ).map(([k, v]) => (
                <div key={k}>
                  <p className="eyebrow mb-1">{k}</p>
                  {v.length ? (
                    <ul className="space-y-1 text-ink-2">
                      {v.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted">None.</p>
                  )}
                </div>
              ))}
            </div>
          </Block>
        ) : null}

        {r.causal_hypotheses ? (
          <Block id="causal" title="Causal Hypotheses" count={r.causal_hypotheses.length} empty="No sequence in the material suggests a candidate mechanism.">
            <p className="mb-4 text-[13px] text-muted">Sequence is not causation. Each candidate remains a hypothesis unless independently demonstrated.</p>
            <div className="space-y-3">
              {r.causal_hypotheses.map((h) => (
                <Finding key={h.id} meta={<><EpistemicBadge value={h.epistemic_class} /><ConfidenceBadge value={h.confidence} /></>}>
                  <dl className="space-y-2 text-[13.5px]">
                    <div>
                      <dt className="eyebrow">Observed sequence</dt>
                      <dd>{h.observed_sequence}</dd>
                    </div>
                    <div>
                      <dt className="eyebrow">Candidate mechanism</dt>
                      <dd>{h.candidate_mechanism}</dd>
                    </div>
                    <div>
                      <dt className="eyebrow">Alternative mechanisms</dt>
                      <dd>
                        <ul className="space-y-0.5 text-ink-2">
                          {h.alternative_mechanisms.map((a) => (
                            <li key={a}>{a}</li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                    <div>
                      <dt className="eyebrow">Disconfirming evidence</dt>
                      <dd className="text-ink-2">{h.disconfirming_evidence.join(' ')}</dd>
                    </div>
                  </dl>
                </Finding>
              ))}
            </div>
          </Block>
        ) : null}

        <Block id="ledger" title="Epistemic Ledger">
          <div className="space-y-5">
            {EPISTEMIC_BUCKETS.map((b) => {
              const items = r.epistemic_separation[b]
              return (
                <div key={b}>
                  <h3 className="eyebrow mb-2">
                    {EPISTEMIC_BUCKET_LABELS[b]} <span className="text-muted">· {items.length}</span>
                  </h3>
                  {items.length ? (
                    <ul className="space-y-1.5">
                      {items.map((it) => (
                        <li key={it.id} className="grid gap-1 text-[13.5px] sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-3">
                          <span>
                            <EpistemicBadge value={it.epistemic_class} />
                          </span>
                          <span className="text-ink-2">
                            {it.statement}
                            {it.anchors[0]?.quote && !it.statement.includes(it.anchors[0].quote) ? <span className="block font-serif text-[14px] text-ink">“{it.anchors[0].quote}”</span> : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] text-muted">None.</p>
                  )}
                </div>
              )
            })}
          </div>
        </Block>

        <Block id="audit" title="Meta-Observational Integrity Audit">
          <ul className="divide-y divide-line rounded-[3px] border border-line">
            {r.integrity_audit.checks.map((c) => (
              <li key={c.check} className="grid gap-1 px-4 py-2.5 text-[13px] sm:grid-cols-[200px_110px_minmax(0,1fr)] sm:gap-3">
                <span className="font-medium">{INTEGRITY_LABELS[c.check]}</span>
                <span className={cn('text-[12px] font-semibold uppercase tracking-wide', c.result === 'corrected' ? 'text-accent' : c.result === 'flagged' ? 'text-danger' : 'text-muted')}>{c.result.replace('_', ' ')}</span>
                <span className="text-ink-2">{c.note}</span>
              </li>
            ))}
          </ul>
          {r.integrity_audit.corrections.length ? (
            <div className="mt-4">
              <p className="eyebrow mb-1">Material corrections</p>
              <ul className="space-y-0.5 text-[13px] text-ink-2">
                {r.integrity_audit.corrections.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Block>

        <section id="boundary" className="scroll-mt-24 border-y-2 border-ink py-6 text-center">
          <p className="eyebrow mb-2">Boundary</p>
          <p className="display text-[24px]">{BOUNDARY_STATEMENT}</p>
          <p className="mt-2 text-[13px] text-muted">What follows from this is a human choice, made outside the PCI Engine.</p>
        </section>
      </div>
    </div>
  )
}
