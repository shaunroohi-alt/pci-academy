import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LedgerEntryView } from './entry'

export const metadata: Metadata = { title: 'Ledger entry' }

export default function Page() {
  return (
    <Suspense>
      <LedgerEntryView />
    </Suspense>
  )
}
