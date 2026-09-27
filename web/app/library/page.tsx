import type { Metadata } from 'next'
import { LibraryIndex } from './library-index'

export const metadata: Metadata = { title: 'Library' }

export default function Page() {
  return <LibraryIndex />
}
