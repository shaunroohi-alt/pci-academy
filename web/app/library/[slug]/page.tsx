import type { Metadata } from 'next'
import { Reader } from '@/components/library/reader'
import { SEED_CONTENT } from '@/lib/content/catalog'

export const dynamicParams = false

export function generateStaticParams() {
  return SEED_CONTENT.filter((c) => c.collection !== 'art-of-being').map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const item = SEED_CONTENT.find((c) => c.slug === slug)
  return { title: item?.title ?? 'Library', description: item?.summary }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const item = SEED_CONTENT.find((c) => c.slug === slug)
  return <Reader slug={slug} collection={item?.collection ?? 'pci-framework'} />
}
