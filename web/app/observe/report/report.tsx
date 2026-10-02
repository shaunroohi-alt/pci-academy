'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'
import { AskQuestions } from '@/components/pci/ask-questions'
import { ReportView } from '@/components/pci/report-view'
import { Button } from '@/components/ui/button'
import { Badge, Empty, Label, Notice, Spinner, Switch, Textarea } from '@/components/ui/primitives'
import { useApp, useData } from '@/lib/app/context'
import { SEVEN_OPERATIONS, SOURCE_TYPE_LABELS } from '@/lib/pci/canon'
import { cn, download, formatDateTime } from '@/lib/utils'

export function Report() {
  const params = useSearchParams()
  const id = params.get('id') ?? ''
  const initialError = params.get('error')
  const router = useRouter()
  const { repo, prefs } = useApp()
  const { data: bundle, loading } = useData((r) => r.observation(id), [id])
  const [selected, setSelected] = React.useState<number | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(initialError)
  const [addendum, setAddendum] = React.useState('')
  const [showAdd, setShowAdd] = React.useState(false)
  const [lensesChoice, setLenses] = React.useState<boolean | null>(null)
  const [causalChoice, setCausal] = React.useState<boolean | null>(null)
  const lenses = lensesChoice ?? prefs.lenses_default
  const causal = causalChoice ?? prefs.causal_default
  const [showOriginal, setShowOriginal] = React.useState(false)

  if (loading) return <Spinner label="Opening report" />
  if (!bundle) {
    return (
      <Empty title="Observation not found" action={<Link href="/observe/" className="text-accent">Back to Observe</Link>}>
        It may have been deleted, or it belongs to material stored on another device.
      </Empty>
    )
  }

  const { input, addenda, versions } = bundle
  const current = versions.find((v) => v.version === selected) ?? versions.at(-1)
  const latestAdded = addenda.filter((a) => !versions.at(-1)?.addenda_included.includes(a.id))

  const reanalyse = async () => {
    if (!repo) return
    setBusy(true)
    setError(null)
    try {
      const v = await repo.analyze(input.id, { lenses, causal })
      setSelected(v.version)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed.')
    } finally {
      setBusy(false)
    }
  }

  const addInfo = async () => {
    if (!repo || !addendum.trim()) return
    await repo.addAddendum(input.id, addendum)
    setAddendum('')
    setShowAdd(false)
  }

  const remove = async () => {
    if (!repo) return
    if (!window.confirm('Delete this observation, its original input and every analysis version? This cannot be undone.')) return
    await repo.deleteObservation(input.id)
    router.push('/observe/')
  }

  return (
    <article>
      <header className="mb-8">
        <p className="eyebrow mb-2">
          Observational report · {SOURCE_TYPE_LABELS[input.source_type]} · {input.mode === 'guided' ? 'Guided' : 'Direct'}
        </p>
        <h1 className="display text-[36px] sm:text-[44px]">{input.title}</h1>
        <p className="mt-2 text-[13px] text-muted">
          Observed {formatDateTime(input.created_at)}
          {input.source_ref ? (
            <>
              {' '}
              · from{' '}
              {input.source_ref.kind === 'journal' ? (
                <Link className="text-accent" href={`/journal/?date=${input.source_ref.id}`}>
                  {input.source_ref.label}
                </Link>
              ) : input.source_ref.kind === 'contrary' ? (
                <Link className="text-accent" href={`/contrary/session/?id=${input.source_ref.id}`}>
                  {input.source_ref.label}
                </Link>
              ) : (
                input.source_ref.label
              )}
            </>
          ) : null}
        </p>
      </header>

      <div className="no-print mb-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[4px] border border-line bg-raised">
          <button type="button" onClick={() => setShowOriginal(!showOriginal)} aria-expanded={showOriginal} className="flex w-full cursor-pointer items-center justify-between px-5 py-3 text-left">
            <span className="min-w-0 flex-1">
              <span className="eyebrow">Original input · preserved unchanged</span>
              {!showOriginal ? <span className="mt-1 block truncate font-serif text-[15px] text-ink-2">{input.raw}</span> : null}
            </span>
            <span className="ml-4 shrink-0 text-[12px] text-accent">{showOriginal ? 'Hide' : 'Show'}</span>
          </button>
          {showOriginal ? (
            <div className="border-t border-line px-5 py-4">
              <p className="writing whitespace-pre-wrap">{input.raw}</p>
              {input.guided_answers ? (
                <dl className="mt-4 space-y-3 border-t border-line pt-4">
                  {SEVEN_OPERATIONS.filter((op) => op.n > 1 && input.guided_answers?.[op.n as 2]).map((op) => (
                    <div key={op.key}>
                      <dt className="eyebrow">
                        {op.n} · {op.name}
                      </dt>
                      <dd className="font-serif text-[15px]">{input.guided_answers?.[op.n as 2]}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {addenda.length ? (
                <div className="mt-4 space-y-3 border-t border-line pt-4">
                  {addenda.map((a) => (
                    <div key={a.id}>
                      <p className="eyebrow">Added {formatDateTime(a.created_at)}</p>
                      <p className="font-serif text-[15px]">{a.text}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              <p className="mt-4 text-[12px] text-muted">Content hash {input.content_hash}. New information is added alongside the original, never written over it.</p>
            </div>
          ) : null}
        </div>

        <div className="rounded-[4px] border border-line p-5">
          <p className="eyebrow mb-2">Analysis versions</p>
          {versions.length ? (
            <ol className="space-y-1">
              {versions.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(v.version)}
                    aria-current={current?.id === v.id ? 'true' : undefined}
                    className={cn('flex w-full cursor-pointer items-center justify-between rounded-[3px] px-2 py-1.5 text-left text-[13px]', current?.id === v.id ? 'bg-surface font-medium' : 'hover:bg-surface')}
                  >
                    <span>
                      v{v.version} · {formatDateTime(v.created_at)}
                    </span>
                    {v.status === 'quarantined' ? <Badge tone="danger">Quarantined</Badge> : v.longitudinal ? <Badge>Compared</Badge> : null}
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[13px] text-muted">Not analysed yet.</p>
          )}
          {latestAdded.length ? <Notice className="mt-3">New information has been added since the latest analysis.</Notice> : null}
          <div className="mt-3 border-t border-line pt-2">
            <Switch id="re-lenses" checked={lenses} onChange={setLenses} label="Multi-lens" />
            <Switch id="re-causal" checked={causal} onChange={setCausal} label="Causal hypotheses" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={reanalyse} disabled={busy}>
              {busy ? 'Analysing…' : versions.length ? 'Re-analyse' : 'Analyse'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)}>
              Add new information
            </Button>
          </div>
          {showAdd ? (
            <div className="mt-3">
              <Label htmlFor="addendum">New information</Label>
              <Textarea id="addendum" value={addendum} onChange={(e) => setAddendum(e.target.value)} className="min-h-24 text-[14px]" />
              <Button size="sm" className="mt-2" onClick={addInfo} disabled={!addendum.trim()}>
                Add to the record
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <Notice tone="danger" title="Analysis did not complete" className="mb-6">
          {error} The original input is saved; you can re-analyse when ready.
        </Notice>
      ) : null}

      {current?.status === 'quarantined' ? (
        <Notice tone="danger" title={`Version ${current.version} was quarantined`} className="mb-8">
          <p>The provider’s output crossed the PCI boundary or exceeded the available evidence, so it is not shown as a PCI report. It has been kept for review.</p>
          <ul className="mt-2 space-y-1 text-[13px]">
            {current.violations.slice(0, 12).map((v, i) => (
              <li key={i}>
                <span className="font-medium">{v.invariant}</span> — {v.rule} <span className="text-muted">({v.excerpt})</span>
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {current?.report ? (
        <>
          <p className="no-print mb-6 text-[12px] text-muted">
            Version {current.version} · {current.provider === 'local' ? 'PCI Local Engine' : 'PCI Engine (AI provider)'} {current.model} · canon {current.canon_version}
            {current.longitudinal ? ' · compared with earlier material' : ''}
          </p>
          <ReportView report={current.report} />
        </>
      ) : null}

      {/* Questions only on request. The button is the only entry; nothing runs until it is pressed. */}
      <AskQuestions material={input.raw} className="no-print mt-10 border-t border-line pt-6" />

      <div className="no-print mt-10 flex flex-wrap gap-2 border-t border-line pt-6">
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          Print
        </Button>
        <Button variant="outline" size="sm" onClick={() => download(`pci-observation-${input.id}.json`, JSON.stringify(bundle, null, 2))}>
          Export this observation
        </Button>
        <Button variant="danger" size="sm" onClick={remove} className="ml-auto">
          Delete observation
        </Button>
      </div>
    </article>
  )
}
