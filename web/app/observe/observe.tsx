'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Badge, Label, Notice, PageHeader, Select, Spinner, Switch, Tabs, Textarea } from '@/components/ui/primitives'
import { useApp, useAutosave, useData } from '@/lib/app/context'
import { SEVEN_OPERATIONS, SOURCE_TYPES, SOURCE_TYPE_LABELS, type SourceType } from '@/lib/pci/canon'
import type { GuidedAnswers } from '@/lib/pci/schema'
import { cn, formatDateTime } from '@/lib/utils'

type Mode = 'direct' | 'guided'
const SELECTABLE: SourceType[] = SOURCE_TYPES.filter((s) => !['journal_entry', 'ledger_entry', 'contrary_session'].includes(s))

export function Observe() {
  const { repo, provider, prefs, online } = useApp()
  const router = useRouter()
  const params = useSearchParams()
  const [mode, setMode] = React.useState<Mode>('direct')
  const [sourceType, setSourceType] = React.useState<SourceType>('event')
  const [raw, setRaw] = React.useState('')
  const [guided, setGuided] = React.useState<Record<string, string>>({})
  const [step, setStep] = React.useState(0)
  const [lensesChoice, setLenses] = React.useState<boolean | null>(null)
  const [causalChoice, setCausal] = React.useState<boolean | null>(null)
  const lenses = lensesChoice ?? prefs.lenses_default
  const causal = causalChoice ?? prefs.causal_default
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [draftLoaded, setDraftLoaded] = React.useState(false)
  const [savedAt, setSavedAt] = React.useState<string | null>(null)

  const { data: history } = useData((r) => r.observations(), [])

  // Restore the draft, or accept prefilled material (from a lesson).
  React.useEffect(() => {
    if (!repo || draftLoaded) return
    const prefill = params.get('prefill')
    repo.draft().then((d) => {
      if (prefill) {
        setRaw(prefill)
        setSourceType((params.get('source') as SourceType) ?? 'general_observation')
      } else if (d) {
        setMode(d.mode)
        setSourceType(d.source_type as SourceType)
        setRaw(d.raw)
        setGuided(d.guided)
        setStep(d.step)
      }
      setDraftLoaded(true)
    })
  }, [repo, draftLoaded, params])

  // Autosave the draft; flushed if the page is left before the pause ends.
  const autosave = useAutosave(async () => {
    if (!repo) return
    await repo.saveDraft({ mode, source_type: sourceType, raw, guided, step })
    setSavedAt(new Date().toISOString())
  }, 600)
  const { schedule } = autosave
  React.useEffect(() => {
    if (!draftLoaded || (!raw.trim() && !Object.values(guided).some((v) => v.trim()))) return
    schedule()
  }, [schedule, draftLoaded, mode, sourceType, raw, guided, step])

  const material = mode === 'guided' ? guided['1'] ?? '' : raw
  const canSubmit = material.trim().length > 0 && !busy

  const submit = async () => {
    if (!repo || !canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const answers: GuidedAnswers | undefined =
        mode === 'guided'
          ? (Object.fromEntries(Object.entries(guided).filter(([, v]) => v.trim())) as unknown as GuidedAnswers)
          : undefined
      autosave.cancel()
      const observation = await repo.createObservation({ raw: material, mode, source_type: sourceType, guided: answers })
      try {
        await repo.analyze(observation.id, { lenses, causal })
      } catch (e) {
        // The raw input is already saved; analysis can be retried from the report.
        router.push(`/observe/report/?id=${observation.id}&error=${encodeURIComponent(e instanceof Error ? e.message : 'Analysis failed')}`)
        return
      }
      await repo.clearDraft()
      router.push(`/observe/report/?id=${observation.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The material could not be saved.')
      setBusy(false)
    }
  }

  const op = SEVEN_OPERATIONS[step]

  return (
    <div>
      <PageHeader eyebrow="PCI Engine" title="Observe">
        Submit material and receive an observational report. The original is preserved unchanged; each analysis is a separate, revisable version.
      </PageHeader>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <Tabs<Mode>
            label="Mode"
            value={mode}
            onChange={setMode}
            items={[
              { value: 'direct', label: 'Direct analysis' },
              { value: 'guided', label: 'Guided — seven questions' },
            ]}
          />

          <div className="mt-6 max-w-xs">
            <Label htmlFor="source-type">What kind of material is this?</Label>
            <Select id="source-type" value={sourceType} onChange={(e) => setSourceType(e.target.value as SourceType)}>
              {SELECTABLE.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_TYPE_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>

          {mode === 'direct' ? (
            <div className="mt-6">
              <Label htmlFor="material">Material</Label>
              <Textarea
                id="material"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                className="writing min-h-72"
                placeholder="Describe what occurred, or paste the material. It will be kept exactly as written."
              />
            </div>
          ) : (
            <div className="mt-6">
              <ol className="mb-5 flex gap-1.5" aria-label="Questions">
                {SEVEN_OPERATIONS.map((o, i) => (
                  <li key={o.key} className="flex-1">
                    <button
                      type="button"
                      onClick={() => setStep(i)}
                      aria-label={`Question ${o.n}: ${o.name}`}
                      aria-current={i === step ? 'step' : undefined}
                      className={cn('block h-1.5 w-full cursor-pointer rounded-full', i === step ? 'bg-ink' : guided[String(o.n)]?.trim() ? 'bg-ink-2/60' : 'bg-line-strong')}
                    />
                  </li>
                ))}
              </ol>
              <p className="eyebrow mb-1">
                Question {op.n} of 7 · {op.name}
              </p>
              <h2 className="display text-[28px] leading-tight">{op.question}</h2>
              <p className="mt-1 text-[13px] text-muted">{op.principle}</p>
              <Textarea
                key={op.key}
                aria-label={op.question}
                value={guided[String(op.n)] ?? ''}
                onChange={(e) => setGuided((g) => ({ ...g, [String(op.n)]: e.target.value }))}
                className="writing mt-4 min-h-52"
                placeholder={op.n === 1 ? 'Required. What occurred, or what material is present — before explanation.' : 'Optional. Your own answer becomes part of the material.'}
              />
              <div className="mt-3 flex justify-between">
                <Button variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
                  Previous question
                </Button>
                {step < 6 ? (
                  <Button variant="outline" size="sm" onClick={() => setStep((s) => Math.min(6, s + 1))}>
                    Next question
                  </Button>
                ) : null}
              </div>
            </div>
          )}

          {error ? (
            <Notice tone="danger" title="Not submitted" className="mt-4">
              {error} Your draft is still here.
            </Notice>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Button size="lg" onClick={submit} disabled={!canSubmit}>
              {busy ? 'Observing…' : 'Observe'}
            </Button>
            {busy ? <Spinner label="Running the seven operations" /> : null}
            {savedAt && !busy ? <span className="text-[12px] text-muted">Draft saved on this device</span> : null}
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-[4px] border border-line bg-raised p-5">
            <p className="eyebrow mb-2">Engine</p>
            <p className="font-medium">{provider.label}</p>
            <p className="mt-1 text-[13px] text-ink-2">{provider.description}</p>
            {provider.capabilities.sendsMaterial && !online ? <Notice tone="danger" className="mt-3">You are offline. AI analysis needs a connection.</Notice> : null}
            <p className="mt-3 text-[12px] text-muted">Comparison with earlier material: {prefs.longitudinal ? 'on' : 'off'} · <Link href="/account/" className="text-accent">change</Link></p>
          </div>
          <div className="rounded-[4px] border border-line p-5">
            <p className="eyebrow mb-1">Optional depth</p>
            <Switch id="opt-lenses" checked={lenses} onChange={setLenses} label="Multi-lens analysis" description="Findings under separate lenses, compared only after isolation." />
            <Switch id="opt-causal" checked={causal} onChange={setCausal} label="Causal hypotheses" description="Sequences held as hypotheses, with alternatives and disconfirming evidence." />
          </div>
        </aside>
      </div>

      <section className="mt-16" aria-labelledby="history-h">
        <h2 id="history-h" className="display mb-4 text-[28px]">
          Your observations
        </h2>
        {history?.length ? (
          <ul className="divide-y divide-line border-y border-line">
            {history.map(({ input, latest, versions }) => (
              <li key={input.id}>
                <Link href={`/observe/report/?id=${input.id}`} className="flex flex-col gap-1 py-3 hover:bg-surface sm:flex-row sm:items-center sm:gap-4 sm:px-2">
                  <span className="flex-1 font-serif text-[16px]">{input.title}</span>
                  <span className="flex items-center gap-2 text-[12px] text-muted">
                    {SOURCE_TYPE_LABELS[input.source_type]} · {formatDateTime(input.created_at)} · {versions} version{versions === 1 ? '' : 's'}
                    {latest?.status === 'quarantined' ? <Badge tone="danger">Quarantined</Badge> : null}
                    {!latest ? <Badge>Not analysed</Badge> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-muted">Nothing observed yet.</p>
        )}
      </section>
    </div>
  )
}
