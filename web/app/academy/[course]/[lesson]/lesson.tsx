'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Notice, Textarea } from '@/components/ui/primitives'
import { useApp, useAutosave, useData } from '@/lib/app/context'
import { courseBySlug, hrefFor, readable, TERM_BY_SLUG } from '@/lib/content/catalog'
import { blockText, parseBlocks } from '@/lib/content/markdown'
import { today } from '@/lib/utils'

export function LessonView({ courseSlug, lessonId }: { courseSlug: string; lessonId: string }) {
  const course = courseBySlug(courseSlug)!
  const index = course.lessons.findIndex((l) => l.lesson_id === lessonId)
  const lesson = course.lessons[index]
  const prev = course.lessons[index - 1]
  const next = course.lessons[index + 1]
  const lessonModule = course.modules.find((m) => m.slug === lesson.module)
  const { repo, content } = useApp()
  const journalId = `lesson-${courseSlug}-${lessonId}`
  const { data: entry, loading: entryLoading } = useData((r) => r.journalEntry(journalId), [journalId])
  const { data: progress } = useData((r) => r.lessonProgress(courseSlug), [courseSlug])
  const done = progress?.some((p) => p.lesson_slug === lessonId && p.completed_at)

  React.useEffect(() => {
    if (repo) void repo.markLesson(courseSlug, lessonId)
  }, [repo, courseSlug, lessonId])

  return (
    <article className="mx-auto max-w-3xl">
      <Link href={`/academy/${courseSlug}/`} className="text-[13px] text-accent">
        ← {course.title}
      </Link>
      <p className="eyebrow mb-2 mt-6">
        {lessonModule?.title} · Lesson {index + 1} of {course.lessons.length}
      </p>
      <h1 className="display text-[40px] sm:text-[48px]">{lesson.title}</h1>
      <p className="mt-4 font-serif text-[18px] leading-relaxed text-ink-2">{lesson.orientation}</p>

      {lesson.video ? (
        <section className="mt-10" aria-labelledby="video-h">
          <h2 id="video-h" className="eyebrow mb-3">
            Video
          </h2>
          <video controls preload="metadata" className="w-full rounded-[4px] border border-line" src={lesson.video.url}>
            <track kind="captions" />
          </video>
          <details className="mt-3">
            <summary className="cursor-pointer text-[13px] font-medium text-accent">Transcript</summary>
            <p className="mt-2 whitespace-pre-wrap font-serif text-[15px] text-ink-2">{lesson.video.transcript}</p>
          </details>
        </section>
      ) : null}

      <section className="mt-12" aria-labelledby="reading-h">
        <h2 id="reading-h" className="display mb-4 text-[28px]">
          Reading
        </h2>
        <div className="space-y-4">
          {lesson.reading.map((r) => {
            const raw = content.find((c) => c.slug === r.slug)
            const item = raw ? readable(raw) : undefined
            if (!item) return null
            const excerpt = parseBlocks(item.body).filter((b) => b.kind === 'p').slice(0, 2).map(blockText).join(' ')
            return (
              <Link key={r.slug} href={hrefFor(item)} className="block rounded-[4px] border border-line bg-raised p-5 hover:bg-surface">
                <p className="eyebrow mb-1">PCI Framework</p>
                <p className="font-serif text-[20px]">{item.title}</p>
                <p className="mt-2 line-clamp-3 font-serif text-[15px] text-ink-2">{excerpt}</p>
                <p className="mt-2 text-[12px] font-medium text-accent">Read in full →</p>
              </Link>
            )
          })}
        </div>
        {lesson.related_concepts.length ? (
          <p className="mt-4 text-[13px] text-muted">
            Concepts:{' '}
            {lesson.related_concepts.map((c, i) => (
              <span key={c}>
                {i ? ', ' : ''}
                <Link href={`/library/glossary/#${c}`} className="text-accent">
                  {TERM_BY_SLUG.get(c)?.term ?? c}
                </Link>
              </span>
            ))}
          </p>
        ) : null}
      </section>

      <section className="mt-12 border-t border-line pt-8" aria-labelledby="obs-h">
        <h2 id="obs-h" className="display mb-3 text-[28px]">
          Observation
        </h2>
        <p className="font-serif text-[18px] leading-relaxed">{lesson.observation}</p>
      </section>

      <section className="mt-12 border-t border-line pt-8" aria-labelledby="journal-h">
        <h2 id="journal-h" className="display mb-3 text-[28px]">
          Journal
        </h2>
        <p className="font-serif text-[18px] leading-relaxed">{lesson.journal_prompt}</p>
        {entryLoading ? null : <LessonJournal key={journalId} journalId={journalId} courseSlug={courseSlug} lessonId={lessonId} prompt={lesson.journal_prompt} title={lesson.title} optional={lesson.optional_observation} initial={entry?.body ?? ''} />}
      </section>

      <div className="mt-14 flex flex-wrap items-center gap-3 border-t border-line pt-6">
        {prev ? (
          <Link href={`/academy/${courseSlug}/${prev.lesson_id}/`} className="text-[13px] text-accent">
            ← {prev.title}
          </Link>
        ) : null}
        <span className="flex-1" />
        <Button variant={done ? 'outline' : 'primary'} onClick={() => repo?.markLesson(courseSlug, lessonId, true)} disabled={done}>
          {done ? 'Completed' : 'Mark lesson complete'}
        </Button>
        {next ? (
          <Link href={`/academy/${courseSlug}/${next.lesson_id}/`} className="text-[13px] text-accent">
            {next.title} →
          </Link>
        ) : null}
      </div>
    </article>
  )
}

function LessonJournal({ journalId, courseSlug, lessonId, prompt, title, optional, initial }: { journalId: string; courseSlug: string; lessonId: string; prompt: string; title: string; optional: boolean; initial: string }) {
  const { repo } = useApp()
  const router = useRouter()
  const [body, setBody] = React.useState(initial)
  const [saved, setSaved] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const save = React.useCallback(
    (text: string) => repo?.saveJournal({ id: journalId, date: today(), prompt_id: `${courseSlug}/${lessonId}`, prompt_text: prompt, body: text, source: { kind: 'lesson', id: `${courseSlug}/${lessonId}`, label: title } }),
    [repo, journalId, courseSlug, lessonId, prompt, title],
  )

  const autosave = useAutosave(async () => {
    await save(body)
    setSaved(true)
  })

  const analyse = async () => {
    if (!repo || !body.trim()) return
    setBusy(true)
    setError(null)
    try {
      await save(body)
      const { observation } = await repo.analyzeJournal(journalId)
      router.push(`/observe/report/?id=${observation.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed.')
      setBusy(false)
    }
  }

  return (
    <>
      <Textarea
        aria-label="Lesson journal"
        value={body}
        onChange={(e) => {
          setBody(e.target.value)
          setSaved(false)
          autosave.schedule()
        }}
        className="writing mt-4 min-h-48"
        placeholder="Private. Saved as you write, in your Journal archive."
      />
      <p className="mt-1 text-[12px] text-muted" role="status">
        {body.trim() ? (saved ? 'Saved' : 'Saving…') : ''}
      </p>
      {error ? <Notice tone="danger" className="mt-3">{error}</Notice> : null}
      {optional ? (
        <div className="mt-4">
          <Button variant="outline" onClick={analyse} disabled={!body.trim() || busy}>
            {busy ? 'Analysing…' : 'Optional: analyse through PCI'}
          </Button>
        </div>
      ) : null}
    </>
  )
}
