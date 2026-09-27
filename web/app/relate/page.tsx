import type { Metadata } from 'next'
import { Relate } from './relate'

export const metadata: Metadata = { title: 'Relate' }

export default function Page() {
  return <Relate />
}
