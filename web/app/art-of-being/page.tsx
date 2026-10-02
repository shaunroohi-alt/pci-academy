import type { Metadata } from 'next'
import { BookIndex } from '@/components/site/book-index'

export const metadata: Metadata = {
  title: 'The Art of Being',
  description: 'Twelve chapters. Not a program. The live text is the Author’s Voice rewrite.',
}

export default function Page() {
  return <BookIndex />
}
