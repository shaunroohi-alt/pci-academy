import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Observe } from './observe'

export const metadata: Metadata = { title: 'Observe' }

export default function Page() {
  return (
    <Suspense>
      <Observe />
    </Suspense>
  )
}
