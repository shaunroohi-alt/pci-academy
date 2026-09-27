import type { Metadata } from 'next'
import { Reader } from '@/components/library/reader'
import { ART_OF_BEING } from '@/content/seeds/art-of-being'

export const dynamicParams = false

export function generateStaticParams() {
  return ART_OF_BEING.map((c) => ({ chapter: c.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ chapter: string }> }): Promise<Metadata> {
  const { chapter } = await params
  const item = ART_OF_BEING.find((c) => c.slug === chapter)
  return { title: item ? `${item.title} — The Art of Being` : 'The Art of Being' }
}

export default async function Page({ params }: { params: Promise<{ chapter: string }> }) {
  const { chapter } = await params
  return <Reader slug={chapter} collection="art-of-being" />
}
