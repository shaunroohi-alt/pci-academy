import type { Metadata } from 'next'
import { PUBLISHED_COURSES } from '@/lib/content/catalog'
import { LessonView } from './lesson'

export const dynamicParams = false

export function generateStaticParams() {
  return PUBLISHED_COURSES.flatMap((c) => c.lessons.map((l) => ({ course: c.slug, lesson: l.lesson_id })))
}

export async function generateMetadata({ params }: { params: Promise<{ course: string; lesson: string }> }): Promise<Metadata> {
  const { course, lesson } = await params
  return { title: PUBLISHED_COURSES.find((c) => c.slug === course)?.lessons.find((l) => l.lesson_id === lesson)?.title ?? 'Lesson' }
}

export default async function Page({ params }: { params: Promise<{ course: string; lesson: string }> }) {
  const { course, lesson } = await params
  return <LessonView courseSlug={course} lessonId={lesson} />
}
