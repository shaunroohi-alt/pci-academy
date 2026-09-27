import type { Metadata } from 'next'
import { Services } from './services'

export const metadata: Metadata = { title: 'Services' }

export default function Page() {
  return <Services />
}
