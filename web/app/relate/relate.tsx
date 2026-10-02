'use client'

import Link from 'next/link'
import * as React from 'react'
import { ConfidenceBadge, Quote, TemporalBadge } from '@/components/pci/badges'
import { Button } from '@/components/ui/button'
import { Badge, Empty, Notice, PageHeader, Switch, Tabs } from '@/components/ui/primitives'
import { useApp, useData } from '@/lib/app/context'
import { EDGE_NOTE, RELATIONSHIP_LABELS, RELATIONSHIP_TYPES } from '@/lib/pci/canon'
import { buildRelationalModel, type Evidence } from '@/lib/relational/graph'
import { buildTwin, twinReadiness, TWIN_MIN_SOURCES, TWIN_MIN_SPAN_DAYS } from '@/lib/relational/twin'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import { Timeline } from './timeline'

type Tab = 'timeline' | 'patterns' | 'contradictions' | 'connections' | 'twin'

function hrefForSource(id: string): string {
  if (id.startsWith('journal:')) return `/reflection/?date=${id.slice(8)}`
  if (id.startsWith('ledger:')) return `/ledger/entry/?id=${id.slice(7)}`
  if (id.startsWith('contrary:')) return `/contrary/session/?id=${id.slice(9)}`
  return `/observe/report/?id=${id}`
}

function Ev({ e }: { e: Evidence }) {
  return (
    <Quote source={formatDate(e.date)}>
      <Link href={hrefForSource(e.source_id)} className="hover:text-accent">
        “{e.quote}”
      </Link>
    </Quote>
  )
}

export function Relate() {
  const { prefs, setPrefs, repo } = useApp()
  const [tab, setTab] = React.useState<Tab>('timeline')
  const [selected, setSelected] = React.useState<string | null>(null)
  const { data } = useData(
    async (r) => {
      const sources = await r.archive()
      if (!sources) return null
      const ledger = await r.ledger()
      const obs = await r.observations()
      const links: { from: string; to: string; label: string }[] = []
      for (const l of ledger) for (const k of l.links) links.push({ from: `ledger:${l.id}`, to: k.kind === 'observation' ? k.id : `${k.kind}:${k.id}`, label: k.label })
      for (const o of obs) if (o.input.source_ref) links.push({ from: o.input.id, to: `${o.input.source_ref.kind}:${o.input.source_ref.id}`, label: o.input.source_ref.label ?? 'Source' })
      return { sources, links, twins: await r.twinVersions() }
    },
    [prefs.longitudinal],
  )
  const model = React.useMemo(() => (data ? buildRelationalModel(data.sources, data.links, new Date().toISOString()) : null), [data])

  if (!prefs.longitudinal) {
    return (
      <div className="max-w-2xl">
        <PageHeader eyebrow="Relate" title="Relational intelligence">
          Patterns, contradictions, revisions and connections across time — drawn from your earlier material.
        </PageHeader>
        <Notice title="Comparison with earlier material is off">
          This view reads your earlier observations, journal, ledger and sessions. It stays off until you allow it, and switching it off stops it immediately.
        </Notice>
        <div className="mt-4 rounded-[4px] border border-line px-5">
          <Switch id="relate-longitudinal" checked={prefs.longitudinal} onChange={(v) => setPrefs({ longitudinal: v })} label="Allow comparison with my earlier material" />
        </div>
      </div>
    )
  }

  if (!model) return null
  const readiness = twinReadiness(model)
  const latestTwin = data?.twins.at(-1)
  const sel = model.nodes.find((n) => n.id === selected)

  const rebuild = async () => {
    if (!repo || !readiness.ready) return
    await repo.saveTwinVersion(buildTwin(model, latestTwin))
  }

  return (
    <div>
      <PageHeader eyebrow="Relate" title="Relational intelligence">
        {model.nodes.length} pieces of material, {model.edges.length} visible relationships. {EDGE_NOTE}
      </PageHeader>

      {model.nodes.length < 2 ? (
        <Empty title="Not enough material yet">Relationships appear once there are at least two pieces of material — journal entries, ledger entries, observations or sessions.</Empty>
      ) : (
        <>
          <Tabs<Tab>
            label="Views"
            value={tab}
            onChange={setTab}
            items={[
              { value: 'timeline', label: 'Timeline' },
              { value: 'patterns', label: 'Patterns', count: model.patterns.length },
              { value: 'contradictions', label: 'Contradictions', count: model.contradictions.length },
              { value: 'connections', label: 'Connections', count: model.edges.length },
              { value: 'twin', label: 'Cognitive Twin' },
            ]}
          />
          <div className="mt-6">
            {tab === 'timeline' ? (
              <div className="space-y-4">
                <Timeline nodes={model.nodes} edges={model.edges} onSelect={setSelected} selected={selected} />
                {sel ? (
                  <div className="rounded-[4px] border border-line p-4">
                    <p className="eyebrow">
                      {sel.kind} · {formatDateTime(sel.date)}
                    </p>
                    <Link href={hrefForSource(sel.id)} className="mt-1 block font-serif text-[18px] hover:text-accent">
                      {sel.title}
                    </Link>
                    <ul className="mt-3 space-y-1 text-[13px]">
                      {model.edges
                        .filter((e) => e.from === sel.id || e.to === sel.id)
                        .map((e) => {
                          const other = model.nodes.find((n) => n.id === (e.from === sel.id ? e.to : e.from))
                          return (
                            <li key={e.id} className="flex flex-wrap gap-2">
                              <span className="w-32 shrink-0 font-semibold uppercase tracking-wide text-accent">{RELATIONSHIP_LABELS[e.type]}</span>
                              <span className="text-ink-2">
                                {other ? `${other.title} — ` : ''}
                                {e.note}
                              </span>
                            </li>
                          )
                        })}
                    </ul>
                  </div>
                ) : (
                  <p className="text-[13px] text-muted">Select a point to see its relationships.</p>
                )}
              </div>
            ) : tab === 'patterns' ? (
              model.patterns.length ? (
                <div className="space-y-4">
                  {model.patterns.map((p) => (
                    <div key={p.key} className="rounded-[4px] border border-line bg-raised p-5">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="display text-[24px]">“{p.term}”</span>
                        <TemporalBadge value={p.temporal} />
                        <ConfidenceBadge value={p.confidence} />
                      </div>
                      <p className="text-[14px] text-ink-2">
                        {p.occurrences.length} sources, {formatDate(p.first)} – {formatDate(p.last)}.
                        {p.presentUnder.length ? ` Present under: ${p.presentUnder.slice(0, 4).map((c) => `“${c}”`).join(', ')}.` : ''}
                        {p.absentUnder.length ? ` Absent under: ${p.absentUnder.map((c) => `“${c}”`).join(', ')}.` : ''}
                        {p.emotions.length ? ` Reported emotion alongside: ${p.emotions.join(', ')}.` : ''}
                      </p>
                      {p.temporal === 'historical_pattern' || p.temporal === 'interrupted_pattern' ? <p className="mt-1 text-[12px] text-muted">Historical material describes its own time, not the present.</p> : null}
                      <ol className="mt-4 grid gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
                        {p.stages.map((s) => (
                          <li key={s.stage} className={cn('rounded-[3px] border px-2.5 py-1.5 text-[12px]', s.evidenced ? 'border-line-strong bg-surface font-medium' : 'border-dashed border-line text-muted')}>
                            {s.stage}
                          </li>
                        ))}
                      </ol>
                      <p className="mt-2 text-[12px] italic text-muted">Pattern Adoption stages are marked only where the material evidences them. Recurrence does not establish origin, and a pattern is not an identity.</p>
                      <details className="mt-3">
                        <summary className="cursor-pointer text-[13px] font-medium text-accent">Occurrences{p.exceptions.length ? ` and ${p.exceptions.length} exception${p.exceptions.length > 1 ? 's' : ''}` : ''}</summary>
                        <div className="mt-3 space-y-2">
                          {p.occurrences.map((o) => (
                            <Ev key={o.source_id} e={o} />
                          ))}
                          {p.exceptions.map((o) => (
                            <div key={`x-${o.source_id}`}>
                              <Badge tone="danger">Exception</Badge>
                              <Ev e={o} />
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty title="No recurring themes yet">A pattern needs the same theme in at least three separate pieces of material.</Empty>
              )
            ) : tab === 'contradictions' ? (
              model.contradictions.length ? (
                <div className="space-y-3">
                  {model.contradictions.map((c) => (
                    <div key={c.id} className="rounded-[4px] border border-line p-4">
                      <p className="mb-3 text-[13px] text-ink-2">
                        <Badge>{c.label}</Badge> <span className="ml-1">{c.status === 'revised' ? 'Revised — both positions kept' : 'Unresolved — left visible'}</span>
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Ev e={c.a} />
                        <Ev e={c.b} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty title="No contradictions mapped">No opposed positions on the same matter appear across your material.</Empty>
              )
            ) : tab === 'connections' ? (
              <div className="space-y-6">
                {RELATIONSHIP_TYPES.filter((t) => model.edges.some((e) => e.type === t)).map((t) => (
                  <div key={t}>
                    <p className="eyebrow mb-2">{RELATIONSHIP_LABELS[t]}</p>
                    <ul className="divide-y divide-line border-y border-line">
                      {model.edges
                        .filter((e) => e.type === t)
                        .slice(0, 30)
                        .map((e) => {
                          const a = model.nodes.find((n) => n.id === e.from)
                          const b = model.nodes.find((n) => n.id === e.to)
                          return (
                            <li key={e.id} className="grid gap-1 py-2 text-[13px] sm:grid-cols-[1fr_1fr_1.4fr] sm:gap-3">
                              <Link href={hrefForSource(e.from)} className="truncate hover:text-accent">{a?.title}</Link>
                              <Link href={hrefForSource(e.to)} className="truncate hover:text-accent">{b?.title}</Link>
                              <span className="text-ink-2">{e.note}</span>
                            </li>
                          )
                        })}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <section id="twin" className="max-w-3xl">
                <p className="text-[14px] text-ink-2">
                  An opt-in, revisable structural model built from your material. It is not a declaration of who you are. Each element links to the material that supports it and to the material that contradicts it, and every rebuild is a new version.
                </p>
                {!prefs.twin_opt_in ? (
                  <div className="mt-4 rounded-[4px] border border-line px-5">
                    <Switch id="twin-optin" checked={prefs.twin_opt_in} onChange={(v) => setPrefs({ twin_opt_in: v })} label="Enable the Cognitive Twin" description="Off by default. Nothing is built until you enable it." />
                  </div>
                ) : !readiness.ready ? (
                  <Notice className="mt-4" title="Not enough longitudinal material yet">
                    {readiness.reason} The model is withheld until then: depth without history produces speculation rather than observation. (Thresholds: {TWIN_MIN_SOURCES} sources, {TWIN_MIN_SPAN_DAYS} days.)
                  </Notice>
                ) : (
                  <div className="mt-4">
                    <Button onClick={rebuild}>{latestTwin ? 'Rebuild with new material' : 'Build the first version'}</Button>
                    {data?.twins.length ? <p className="mt-2 text-[12px] text-muted">{data.twins.length} version{data.twins.length > 1 ? 's' : ''} kept. Earlier versions are never rewritten.</p> : null}
                  </div>
                )}
                {latestTwin ? (
                  <div className="mt-8 space-y-4">
                    <p className="eyebrow">
                      Version {latestTwin.version} · {formatDateTime(latestTwin.created_at)} · {latestTwin.sources} sources over {latestTwin.span_days} days
                    </p>
                    {latestTwin.elements.map((el) => (
                      <div key={el.id} className="rounded-[4px] border border-line bg-raised p-4">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge tone={el.status === 'contradicted' ? 'danger' : el.status === 'new' ? 'accent' : 'neutral'}>{el.status}</Badge>
                          <span className="text-[11px] uppercase tracking-wide text-muted">{el.epistemic_class.replace('_', ' ')}</span>
                          <span className="text-[12px] text-muted">{el.confidence}</span>
                        </div>
                        <p className="text-[14.5px]">{el.statement}</p>
                        <p className="mt-1 text-[12px] text-muted">{el.revision_note}</p>
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[12px] font-medium text-accent">
                            {el.supporting.length} supporting · {el.contradicting.length} contradicting
                          </summary>
                          <div className="mt-2 space-y-2">
                            {el.supporting.map((s) => (
                              <Ev key={s.source_id} e={s} />
                            ))}
                            {el.contradicting.map((s) => (
                              <div key={`c-${s.source_id}`}>
                                <Badge tone="danger">Contradicting</Badge>
                                <Ev e={s} />
                              </div>
                            ))}
                          </div>
                        </details>
                      </div>
                    ))}
                    {latestTwin.dissolved.length ? (
                      <div>
                        <p className="eyebrow mb-2">Dissolved in this version</p>
                        <ul className="space-y-1 text-[13px] text-muted">
                          {latestTwin.dissolved.map((d) => (
                            <li key={d.id}>{d.statement}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>
            )}
          </div>
        </>
      )}
    </div>
  )
}
