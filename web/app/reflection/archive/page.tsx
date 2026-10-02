import type { Metadata } from 'next'
import { JournalArchive } from './archive'

export const metadata: Metadata = { title: 'Journal archive' }

export default function Page() {
  return <JournalArchive />
}
