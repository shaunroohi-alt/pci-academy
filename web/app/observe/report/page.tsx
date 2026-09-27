import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Report } from './report'

export const metadata: Metadata = { title: 'Observational report' }

export default function Page() {
  return (
    <Suspense>
      <Report />
    </Suspense>
  )
}
