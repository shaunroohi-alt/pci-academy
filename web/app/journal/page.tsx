import type { Metadata } from 'next'
import { Redirect } from '@/components/redirect'

export const metadata: Metadata = { title: 'Reflection' }

export default function Page() {
  return <Redirect to="/reflection/" />
}
