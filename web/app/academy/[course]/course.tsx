'use client'

import { Check } from 'lucide-react'
import Link from 'next/link'
import { LinkButton } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/primitives'
import { useData } from '@/lib/app/context'
import { courseBySlug } from '@/lib/content/catalog'

export function CourseView({ slug }: { slug: string }) {
  const course = courseBySlug(slug)!
  const { data: progress } = useData((r) => r.lessonProgress(slug), [slug])
  const doneIds = new Set(progress?.filter((p) => p.completed_at).map((p) => p.lesson_slug))
  const openedIds = new Set(progress?.map((p) => p.lesson_slug))
  const next = course.lessons.find((l) => !doneIds.has(l.lesson_id)) ?? course.lessons[0]

  return (
    <div className="max-w-3xl">
      <Link href="/academy/" className="text-[13px] text-accent">
        ← Academy
      </Link>
      <div className="mt-4">
        <PageHeader eyebrow="Course" title={course.title} actions={<LinkButton href={`/academy/${slug}/${next.lesson_id}/`}>{openedIds.size ? 'Continue' : 'Begin'}</LinkButton>}>
          {course.summary}
        </PageHeader>
      </div>
      {course.modules.map((m, mi) => (
        <section key={m.slug} className="mb-8">
          <p className="eyebrow mb-2">
            Module {mi + 1} · {m.title}
          </p>
          <ol className="divide-y divide-line border-y border-line">
            {course.lessons
              .filter((l) => l.module === m.slug)
              .map((l) => (
                <li key={l.lesson_id}>
                  <Link href={`/academy/${slug}/${l.lesson_id}/`} className="flex items-center gap-3 py-3 hover:bg-surface sm:px-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-strong" aria-hidden>
                      {doneIds.has(l.lesson_id) ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span className="flex-1 font-serif text-[17px]">{l.title}</span>
                    <span className="text-[12px] text-muted">{doneIds.has(l.lesson_id) ? 'Completed' : openedIds.has(l.lesson_id) ? 'Opened' : ''}</span>
                  </Link>
                </li>
              ))}
          </ol>
        </section>
      ))}
      <p className="text-[12px] text-muted">Progress is informational. It records which lessons you have opened and completed, and nothing else.</p>
    </div>
  )
}
