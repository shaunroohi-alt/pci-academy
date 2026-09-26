import type { Metadata } from 'next'
import { AcademyIndex } from './academy-index'

export const metadata: Metadata = { title: 'Academy' }

export default function Page() {
  return <AcademyIndex />
}
