import type { Metadata } from 'next'
import { Admin } from './admin'

export const metadata: Metadata = { title: 'Admin', robots: { index: false } }

export default function Page() {
  return <Admin />
}
