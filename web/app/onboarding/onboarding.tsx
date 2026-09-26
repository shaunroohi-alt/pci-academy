'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/primitives'
import { useApp } from '@/lib/app/context'
import { BOUNDARY_STATEMENT, CANONICAL_PIPELINE, SEVEN_OPERATIONS } from '@/lib/pci/canon'
import { backendConfigured } from '@/lib/env'
import { cn } from '@/lib/utils'

export function Onboarding() {
  const { setPrefs, prefs } = useApp()
  const router = useRouter()
  const [step, setStep] = React.useState(0)
  const [longitudinal, setLongitudinal] = React.useState(prefs.longitudinal)
  const heading = React.useRef<HTMLHeadingElement>(null)

  React.useEffect(() => heading.current?.focus(), [step])

  const finish = async () => {
    await setPrefs({ onboarding_complete: true, longitudinal })
    router.push('/today/')
  }

  return (
    <div className="mx-auto max-w-2xl py-6">
      <ol className="mb-10 flex gap-2" aria-label="Onboarding progress">
        {[0, 1, 2].map((i) => (
          <li key={i} className={cn('h-[3px] flex-1 rounded-full', i <= step ? 'bg-ink' : 'bg-line-strong')} aria-current={i === step ? 'step' : undefined}>
            <span className="sr-only">Step {i + 1} of 3</span>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <section>
          <p className="eyebrow mb-3">1 of 3 · What PCI does</p>
          <h1 ref={heading} tabIndex={-1} className="display text-[44px] outline-none">
            PCI makes structure visible.
          </h1>
          <div className="mt-6 space-y-4 font-serif text-[18px] leading-relaxed text-ink-2">
            <p>You bring material — an event, a conversation, a decision, a dream, a question. PCI separates what occurred from what it was taken to mean, compares it where evidence allows, and shows you what is evidenced, what is interpreted, and what is unknown.</p>
            <p>It is not a diagnosis, therapy, a personality test or advice. It does not score you, rank you, or tell you who you really are.</p>
          </div>
        </section>
      ) : step === 1 ? (
        <section>
          <p className="eyebrow mb-3">2 of 3 · Seven operations</p>
          <h1 ref={heading} tabIndex={-1} className="display text-[44px] outline-none">
            Seven questions, then a report.
          </h1>
          <ol className="mt-6 space-y-3">
            {SEVEN_OPERATIONS.map((op) => (
              <li key={op.key} className="grid grid-cols-[28px_1fr] gap-2">
                <span className="font-display text-[20px] text-muted">{op.n}</span>
                <div>
                  <p className="font-medium">{op.name}</p>
                  <p className="text-[14px] text-ink-2">{op.question}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <section>
          <p className="eyebrow mb-3">3 of 3 · Where it stops</p>
          <h1 ref={heading} tabIndex={-1} className="display text-[44px] outline-none">
            The report ends at observation.
          </h1>
          <p className="mt-6 font-display text-[19px] tracking-wide text-ink-2">{CANONICAL_PIPELINE.join(' → ')}</p>
          <blockquote className="mt-6 border-l-2 border-brass pl-4 font-serif text-[18px] italic">{BOUNDARY_STATEMENT}</blockquote>
          <p className="mt-4 text-[15px] text-ink-2">What you think, choose or do next is yours. PCI will not suggest it — including when you ask.</p>

          <div className="mt-8 rounded-[4px] border border-line bg-raised px-5 py-2">
            <p className="pt-3 text-[13px] text-ink-2">
              {backendConfigured
                ? 'Your material is private to your account and can be exported or deleted at any time.'
                : 'Your material stays in this browser, on this device. Nothing is sent anywhere. You can export or delete it at any time.'}
            </p>
            <Switch
              id="onb-longitudinal"
              checked={longitudinal}
              onChange={setLongitudinal}
              label="Allow comparison with my earlier material"
              description="Off by default. When on, the engine may compare new material with your previous journal, ledger and observations to find recurrence, revisions and context changes. You can switch it off at any time in Account."
            />
          </div>
        </section>
      )}

      <div className="mt-12 flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
          Back
        </Button>
        {step < 2 ? <Button onClick={() => setStep((s) => s + 1)}>Continue</Button> : <Button onClick={finish}>Enter PCI</Button>}
      </div>
    </div>
  )
}
