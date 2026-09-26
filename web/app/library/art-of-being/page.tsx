import type { Metadata } from 'next'
import { Book } from './book'

export const metadata: Metadata = { title: 'The Art of Being' }

export default function Page() {
  return <Book />
}
