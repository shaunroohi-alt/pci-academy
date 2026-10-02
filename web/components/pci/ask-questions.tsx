'use client'

// "Ask me questions from this material." Questions appear only after the
// person asks (04-DO-NOT: interest rule). Nothing here runs automatically:
// nothing is computed or shown until the button is clicked, and the list is
// not recomputed when the material changes while it is open.
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { CHAPTERS } from '@/content/site'
import { cn } from '@/lib/utils'
import { questionsFromMaterial, type MaterialQuestion } from '@/lib/pci/questions'

const CLOSING_LINE = 'PCI observes. PCI reports. Then PCI stops.'

function sourceLine(from: MaterialQuestion['from']): string {
  if (from.kind === 'material') return `From your words: “${from.quote}”`
  if (from.collection === 'art-of-being') {
    const ch = CHAPTERS.find((c) => c.slug === from.slug)
    return ch ? `From The Art of Being, Chapter ${ch.n} — ${from.title}` : `From The Art of Being — ${from.title}`
  }
  if (from.collection === 'companion') return `From the Companion Articles — ${from.title}`
  return `From the Library — ${from.title}`
}

export function AskQuestions({ material, className }: { material: string; className?: string }) {
  const [questions, setQuestions] = React.useState<MaterialQuestion[] | null>(null)
  const regionId = React.useId()
  const open = questions !== null
  const blank = !material.trim()

  return (
    <div className={cn('space-y-4', className)}>
      <Button
        variant="outline"
        aria-expanded={open}
        aria-controls={open ? regionId : undefined}
        disabled={blank}
        onClick={() => setQuestions(questionsFromMaterial(material))}
      >
        Ask me questions from this material
      </Button>

      {open ? (
        <section id={regionId} role="region" aria-label="Questions from this material" className="rounded-[3px] border border-line bg-raised p-5">
          {questions.length === 0 ? (
            <p className="font-serif text-[17px] leading-relaxed text-ink">Nothing in this material produced a question.</p>
          ) : (
            <ol className="list-decimal space-y-4 pl-6 marker:text-muted">
              {questions.map((q) => (
                <li key={q.id} className="pl-1">
                  <p className="font-serif text-[18px] leading-relaxed text-ink">{q.text}</p>
                  <p className="mt-1 text-[12px] leading-snug text-muted">{sourceLine(q.from)}</p>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-5 border-t border-line pt-4 text-[13px] text-ink-2">{CLOSING_LINE}</p>
          <div className="mt-4">
            <Button variant="outline" size="sm" onClick={() => setQuestions(null)}>
              Close
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
