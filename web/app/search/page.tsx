import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SearchPage } from './search'

export const metadata: Metadata = { title: 'Search' }

export default function Page() {
  return (
    <Suspense>
      <SearchPage />
    </Suspense>
  )
}
