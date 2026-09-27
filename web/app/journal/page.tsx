import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Journal } from './journal'

export const metadata: Metadata = { title: 'Journal' }

export default function Page() {
  return (
    <Suspense>
      <Journal />
    </Suspense>
  )
}
