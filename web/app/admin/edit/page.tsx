import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Editor } from './editor'

export const metadata: Metadata = { title: 'Edit text', robots: { index: false } }

export default function Page() {
  return (
    <Suspense>
      <Editor />
    </Suspense>
  )
}
