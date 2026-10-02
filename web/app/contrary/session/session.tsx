'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Empty, Input, Notice, Spinner, Textarea } from '@/components/ui/primitives'
import { useApp, useAutosave, useData } from '@/lib/app/context'
import type { ContrarySession } from '@/lib/db/types'
import { BALANCE_NOTE, CONTRARY_STEPS, type ContraryStepKey } from '@/lib/pci/canon'
import { contraryAssist, contraryMaterial } from '@/lib/pci/contrary'
import { cn } from '@/lib/utils'

export function Session() {
  const id = useSearchParams().get('id') ?? ''
  const { data: session, loading } = useData((r) => r.contrary(id), [id])
  if (loading) return <Spinner label="Opening session" />
  if (!session) return <Empty title="Session not found" action={<Link href="/contrary/" className="text-accent">Back</Link>} />
  return <SessionEditor key={session.id} initial={session} />
}

function SessionEditor({ initial }: { initial: ContrarySession }) {
  const router = useRouter()
  const { repo } = useApp()
  const { data: live } = useData((r) => r.contrary(initial.id), [initial.id])
  const session = live ?? initial
  const [steps, setSteps] = React.useState<Partial<Record<ContraryStepKey, string>>>(initial.steps)
  const [title, setTitle] = React.useState(initial.title)
  const [current, setCurrent] = React.useState(initial.current_step)
  const [saved, setSaved] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const autosave = useAutosave(async () => {
    if (!repo) return
    await repo.saveContrary({ id: initial.id, title, steps, current_step: current })
    setSaved(true)
  }, 600)

  const touch = () => {
    setSaved(false)
    autosave.schedule()
  }

  const step = CONTRARY_STEPS[current]
  const assist = contraryAssist(step.key, steps)

  const complete = async () => {
    if (!repo) return
    await repo.saveContrary({ id: session.id, title, steps, current_step: 5, status: 'complete' })
  }

  const observe = async () => {
    if (!repo) return
    setBusy(true)
    setError(null)
    try {
      const obs = await repo.createObservation({ raw: contraryMaterial(steps), mode: 'direct', source_type: 'contrary_session', source_ref: { kind: 'contrary', id: session.id, label: title || 'On the Contrary session' } })
      await repo.saveContrary({ id: session.id, observation_id: obs.id })
      await repo.analyze(obs.id)
      router.push(`/observe/report/?id=${obs.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed.')
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!repo || !window.confirm('Delete this session?')) return
    await repo.deleteContrary(session.id)
    router.push('/contrary/')
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/contrary/" className="text-[13px] text-accent">
        ← On the Contrary
      </Link>
      <Input aria-label="Session title" value={title} onChange={(e) => {
          setTitle(e.target.value)
          touch()
        }} placeholder="Untitled session" className="display mt-3 h-auto border-0 bg-transparent px-0 text-[34px]" />
      {session.source ? (
        <p className="text-[13px] text-muted">
          From{' '}
          {session.source.kind === 'ledger' ? (
            session.source.label
          ) : (
            <Link href={session.source.kind === 'journal' ? `/journal/?date=${session.source.id}` : `/observe/report/?id=${session.source.id}`} className="text-accent">
              {session.source.label}
            </Link>
          )}
        </p>
      ) : null}

      {assist.harm ? (
        <Notice tone="accent" className="mt-5">
          {assist.notes[0]}
        </Notice>
      ) : null}

      <ol className="mt-8 grid grid-cols-3 gap-1.5 sm:grid-cols-6" aria-label="Steps">
        {CONTRARY_STEPS.map((s, i) => (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => {
                setCurrent(i)
                touch()
              }}
              aria-current={i === current ? 'step' : undefined}
              className={cn('w-full cursor-pointer border-t-2 pt-2 text-left text-[12px] font-medium', i === current ? 'border-ink text-ink' : steps[s.key]?.trim() ? 'border-ink-2/50 text-ink-2' : 'border-line-strong text-muted')}
            >
              <span className="block text-[11px] text-muted">{i + 1}</span>
              {s.name}
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <h2 className="display text-[30px]">{step.name}</h2>
          <p className="mt-1 font-serif text-[17px] text-ink-2">{step.prompt}</p>
          {step.key === 'balance' ? <p className="mt-3 border-l-2 border-brass pl-3 text-[13.5px] text-ink-2">{BALANCE_NOTE}</p> : null}
          <Textarea
            key={step.key}
            aria-label={step.name}
            value={steps[step.key] ?? ''}
            onChange={(e) => {
              setSteps({ ...steps, [step.key]: e.target.value })
              touch()
            }}
            className="writing mt-5 min-h-56"
          />
          <div className="mt-3 flex items-center justify-between">
            <Button variant="ghost" onClick={() => {
              setCurrent((c) => Math.max(0, c - 1))
              touch()
            }} disabled={current === 0}>
              Previous
            </Button>
            <span className="text-[12px] text-muted" role="status">
              {saved ? 'Saved' : 'Saving…'}
            </span>
            {current < 5 ? (
              <Button variant="outline" onClick={() => {
                  setCurrent((c) => c + 1)
                  touch()
                }}>
                Next step
              </Button>
            ) : (
              <Button onClick={complete} disabled={session.status === 'complete'}>
                {session.status === 'complete' ? 'Complete' : 'Mark complete'}
              </Button>
            )}
          </div>
        </div>
        <aside className="h-fit rounded-[4px] border border-line bg-raised p-5">
          <p className="eyebrow mb-2">Visible in your words</p>
          {assist.observations.length ? (
            <ul className="space-y-2 text-[13.5px] text-ink-2">
              {assist.observations.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted">Structure from earlier steps appears here as you write.</p>
          )}
          <p className="mt-4 border-t border-line pt-3 text-[12px] text-muted">The engine shows structure. It does not write the contrary position or the balance for you.</p>
        </aside>
      </div>

      {error ? <Notice tone="danger" className="mt-6">{error}</Notice> : null}

      <div className="mt-12 flex flex-wrap gap-2 border-t border-line pt-6">
        <Button variant="outline" onClick={observe} disabled={busy || !contraryMaterial(steps).trim()}>
          {busy ? 'Observing…' : 'Observe this session through PCI'}
        </Button>
        {session.observation_id ? (
          <Link href={`/observe/report/?id=${session.observation_id}`} className="self-center text-[13px] text-accent">
            Latest observation →
          </Link>
        ) : null}
        <Button variant="ghost" className="ml-auto text-danger" onClick={remove}>
          Delete session
        </Button>
      </div>
    </div>
  )
}
