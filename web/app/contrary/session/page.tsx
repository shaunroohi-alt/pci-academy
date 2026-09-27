import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Session } from './session'

export const metadata: Metadata = { title: 'On the Contrary' }

export default function Page() {
  return (
    <Suspense>
      <Session />
    </Suspense>
  )
}
