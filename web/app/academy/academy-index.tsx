'use client'

import Link from 'next/link'
import { PageHeader } from '@/components/ui/primitives'
import { useData } from '@/lib/app/context'
import { PUBLISHED_COURSES } from '@/lib/content/catalog'
import { CANON_STATUS_META } from '@/lib/pci/canon'

export function AcademyIndex() {
  const { data: progress } = useData((r) => r.lessonProgress(), [])
  return (
    <div>
      <PageHeader eyebrow="Learn" title="PCI Academy">
        Courses built on the canonical PCI corpus. Each lesson moves from reading to observation to a journal subject, with PCI analysis optional. Progress records where you are; it is not a score.
      </PageHeader>
      <ul className="grid gap-6 md:grid-cols-2">
        {PUBLISHED_COURSES.map((c) => {
          const done = progress?.filter((p) => p.course_slug === c.slug && p.completed_at).length ?? 0
          return (
            <li key={c.slug}>
              <Link href={`/academy/${c.slug}/`} className="group block h-full rounded-[4px] border border-line bg-raised p-6 hover:bg-surface">
                <p className="eyebrow mb-2">
                  {c.lessons.length} lessons · {c.modules.length} modules · {CANON_STATUS_META[c.canon_status].label}
                </p>
                <h2 className="display text-[30px] group-hover:text-accent">{c.title}</h2>
                <p className="mt-3 text-[14px] text-ink-2">{c.summary}</p>
                {done ? <p className="mt-4 text-[12px] text-muted">{done} of {c.lessons.length} lessons completed</p> : null}
              </Link>
            </li>
          )
        })}
      </ul>
      <p className="mt-10 max-w-2xl text-[13px] text-muted">The Art of Being — Foundations will open when the book’s chapters and the course video material are approved.</p>
    </div>
  )
}
