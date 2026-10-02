'use client'

import Link from 'next/link'
import * as React from 'react'
import { LinkButton } from '@/components/ui/button'
import { Badge, Notice } from '@/components/ui/primitives'
import { promptForDate, PROMPT_CONCEPT_LABELS } from '@/content/seeds/journal-prompts'
import { useApp, useData } from '@/lib/app/context'
import { PUBLISHED_COURSES } from '@/lib/content/catalog'
import { LEDGER_KIND_LABELS, type LessonProgress } from '@/lib/db/types'
import { SOURCE_TYPE_LABELS } from '@/lib/pci/canon'
import { formatDate, formatDateTime, today } from '@/lib/utils'

function currentCourse(progress: LessonProgress[]) {
  for (const c of PUBLISHED_COURSES) {
    const done = progress.filter((p) => p.course_slug === c.slug)
    if (!done.length) continue
    const next = c.lessons.find((l) => !done.some((p) => p.lesson_slug === l.lesson_id && p.completed_at)) ?? c.lessons[c.lessons.length - 1]
    return { course: c, next, opened: done.length }
  }
  return null
}

function Panel({ title, href, action, children }: { title: string; href?: string; action?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-ink pt-4">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="eyebrow text-ink">{title}</h2>
        {href ? (
          <Link href={href} className="text-[12px] font-medium text-accent">
            {action ?? 'Open'} →
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  )
}

export function Today() {
  const { prefs, ready } = useApp()
  const date = today()
  const prompt = promptForDate(date)
  const { data } = useData(async (r) => {
    const [entry, observations, positions, bookmarks, ledger, progress, contrary] = await Promise.all([
      r.journalEntry(date),
      r.observations(),
      r.readingPositions(),
      r.bookmarks(),
      r.ledger(),
      r.lessonProgress(),
      r.contrarySessions(),
    ])
    return { entry, observations, positions, bookmarks, ledger, progress, contrary }
  }, [date])

  const recentObs = data?.observations[0]
  const reading = data?.positions[0]
  const openContrary = data?.contrary.find((c) => c.status === 'in_progress')
  const course = currentCourse(data?.progress ?? [])

  return (
    <div>
      <header className="mb-10">
        <p className="eyebrow mb-2">{formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        <h1 className="display text-[44px] sm:text-[52px]">Today</h1>
      </header>

      {ready && !prefs.onboarding_complete ? (
        <Notice tone="accent" className="mb-8" title="New here?">
          Three short screens explain what PCI does and where it stops. <Link href="/onboarding/" className="font-medium text-accent">Begin</Link>
        </Notice>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-10">
          <Panel title="Today’s journal subject" href={`/reflection/?date=${date}`} action={data?.entry?.body.trim() ? 'Continue' : 'Write'}>
            <p className="eyebrow mb-2 text-muted">{PROMPT_CONCEPT_LABELS[prompt.concept]}</p>
            <p className="font-display text-[28px] leading-snug">{prompt.text}</p>
            {data?.entry?.body.trim() ? (
              <p className="mt-3 line-clamp-2 font-serif text-[15px] text-ink-2">{data.entry.body}</p>
            ) : (
              <div className="mt-5">
                <LinkButton href={`/reflection/?date=${date}`}>Write</LinkButton>
              </div>
            )}
          </Panel>

          <Panel title="Recent observation" href={recentObs ? `/observe/report/?id=${recentObs.input.id}` : '/reflection/?tab=observe'} action={recentObs ? 'Open report' : 'Observe'}>
            {recentObs ? (
              <div>
                <p className="font-serif text-[18px]">{recentObs.input.title}</p>
                <p className="mt-1 text-[12px] text-muted">
                  {SOURCE_TYPE_LABELS[recentObs.input.source_type]} · {formatDateTime(recentObs.input.created_at)} · {recentObs.versions} version{recentObs.versions === 1 ? '' : 's'}
                </p>
                {recentObs.latest?.report ? (
                  <p className="mt-3 border-l-2 border-brass pl-3 text-[14px] text-ink-2">{recentObs.latest.report.what_became_visible[0]?.statement}</p>
                ) : null}
              </div>
            ) : (
              <p className="text-[14px] text-muted">Nothing observed yet. Observe takes an event, a conversation, a decision — any material — and returns what is visible in it.</p>
            )}
          </Panel>

          <Panel title="On the Contrary" href={openContrary ? `/contrary/session/?id=${openContrary.id}` : '/contrary/'} action={openContrary ? 'Resume' : 'Open'}>
            <p className="text-[14px] text-ink-2">
              {openContrary
                ? `A session is in progress: “${openContrary.title || 'Untitled'}”, step ${openContrary.current_step + 1} of 6.`
                : 'Examine an apparent error, problem or unwanted event within the wider system it belongs to.'}
            </p>
          </Panel>
        </div>

        <div className="space-y-10">
          <Panel title="Reading" href={reading?.href ?? '/library/'} action={reading ? 'Continue reading' : 'Library'}>
            {reading ? (
              <div>
                <p className="font-serif text-[17px]">{reading.content_title}</p>
                <div className="mt-2 h-[3px] w-full rounded-full bg-line-strong" aria-hidden>
                  <div className="h-[3px] rounded-full bg-ink" style={{ width: `${Math.round(reading.progress * 100)}%` }} />
                </div>
                <p className="mt-1 text-[12px] text-muted">Position saved {formatDateTime(reading.updated_at)}</p>
              </div>
            ) : (
              <p className="text-[14px] text-muted">The PCI framework and glossary are in the Library.</p>
            )}
          </Panel>

          {course ? (
            <Panel title="Course" href={`/academy/${course.course.slug}/${course.next.lesson_id}/`} action="Continue">
              <p className="font-serif text-[17px]">{course.course.title}</p>
              <p className="mt-1 text-[13px] text-ink-2">Next: {course.next.title}</p>
            </Panel>
          ) : null}

          <Panel title="Saved" href="/library/" action="Library">
            {data?.bookmarks.length ? (
              <ul className="space-y-2">
                {data.bookmarks.slice(0, 4).map((b) => (
                  <li key={b.id} className="text-[14px]">
                    <Link href={`${b.href}#b-${b.block}`} className="font-medium hover:text-accent">
                      {b.content_title}
                    </Link>
                    <span className="block truncate text-[12px] text-muted">{b.excerpt}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-muted">Bookmarks from the reader appear here.</p>
            )}
          </Panel>

          <Panel title="Ledger" href="/ledger/" action="Open Ledger">
            {data?.ledger.length ? (
              <ul className="space-y-2">
                {data.ledger.filter((l) => !l.archived).slice(0, 4).map((l) => (
                  <li key={l.id}>
                    <Link href={`/ledger/entry/?id=${l.id}`} className="flex items-baseline gap-2 text-[14px] hover:text-accent">
                      <Badge>{LEDGER_KIND_LABELS[l.kind]}</Badge>
                      <span className="truncate">{l.title || l.body}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-muted">Ideas, questions, quotes, dreams, fragments — anything worth keeping.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
