import type { Metadata } from 'next'
import { Community } from './community'

export const metadata: Metadata = { title: 'Community' }

export default function Page() {
  return <Community />
}
