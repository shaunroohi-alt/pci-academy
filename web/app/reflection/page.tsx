import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Reflection } from './reflection'

export const metadata: Metadata = { title: 'Reflection' }

export default function Page() {
  return (
    <Suspense>
      <Reflection />
    </Suspense>
  )
}
