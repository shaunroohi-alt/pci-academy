import type { Metadata } from 'next'
import { PUBLISHED_COURSES } from '@/lib/content/catalog'
import { CourseView } from './course'

export const dynamicParams = false

export function generateStaticParams() {
  return PUBLISHED_COURSES.map((c) => ({ course: c.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ course: string }> }): Promise<Metadata> {
  const { course } = await params
  return { title: PUBLISHED_COURSES.find((c) => c.slug === course)?.title ?? 'Course' }
}

export default async function Page({ params }: { params: Promise<{ course: string }> }) {
  const { course } = await params
  return <CourseView slug={course} />
}
