'use client'

import { useSearchParams } from 'next/navigation'
import { Reader } from '@/components/library/reader'
import { useApp } from '@/lib/app/context'

/** Reader for texts published through the CMS after this build (not pre-rendered). */
export function View() {
  const slug = useSearchParams().get('slug') ?? ''
  const { content } = useApp()
  const item = content.find((c) => c.slug === slug)
  return <Reader slug={slug} collection={item?.collection ?? 'articles'} />
}
